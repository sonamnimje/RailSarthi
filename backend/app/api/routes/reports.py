from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from statistics import mean
import random
import io
import csv
from typing import List, Dict, Any, Tuple, Optional

from .users import require_role
from app.db.session import get_db
from app.db.models import TrainPosition, TrainSchedule, Train, TrainLog

router = APIRouter(dependencies=[Depends(require_role("controller", "admin"))])


ZONE_POOL: List[Dict[str, Any]] = [
    {"zone": "CR Zone", "divisions": ["Mumbai", "Nagpur", "Bhusawal"]},
    {"zone": "WR Zone", "divisions": ["Mumbai Central", "Vadodara", "Ahmedabad"]},
    {"zone": "SECR Zone", "divisions": ["Bilaspur", "Nagpur", "Raipur"]},
    {"zone": "NR Zone", "divisions": ["Delhi", "Lucknow", "Ambala"]},
    {"zone": "SR Zone", "divisions": ["Chennai", "Madurai", "Tiruchirapalli"]},
]

SECTION_OVERRIDES: Dict[str, Tuple[str, str]] = {
    "KALYAN-KASARA": ("CR Zone", "Mumbai"),
    "THANE-DADAR": ("CR Zone", "Mumbai"),
    "WR-001": ("WR Zone", "Mumbai Central"),
    "SECR-001": ("SECR Zone", "Bilaspur"),
    "SEC1": ("CR Zone", "Mumbai"),
    "SEC2": ("WR Zone", "Vadodara"),
    "SEC3": ("SECR Zone", "Bilaspur"),
    "SEC4": ("NR Zone", "Delhi"),
}

AI_ACTIONS = [
    ("Hold 2 mins", "Crossing conflict"),
    ("Platform change", "Platform occupied"),
    ("Reroute to loop", "Signal block"),
    ("Give precedence", "High priority express"),
    ("Speed restriction", "Track maintenance"),
]

ALERT_SEVERITY = ["info", "warning", "critical"]

DEFAULT_REFRESH_SECONDS = 20


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_zone(section_id: Optional[str]) -> Tuple[str, str]:
    if not section_id:
        return ("Unknown Zone", "Unassigned")
    section_id_norm = section_id.upper()
    if section_id_norm in SECTION_OVERRIDES:
        return SECTION_OVERRIDES[section_id_norm]
    idx = abs(hash(section_id_norm)) % len(ZONE_POOL)
    bucket = ZONE_POOL[idx]
    divisions = bucket["divisions"]
    div_idx = abs(hash(f"{section_id_norm}-div")) % len(divisions)
    return bucket["zone"], divisions[div_idx]


def _infer_direction(train_id: Optional[str], section_id: Optional[str]) -> str:
    if train_id:
        tid = train_id.upper()
        if tid.endswith("UP"):
            return "Up"
        if tid.endswith("DN"):
            return "Down"
        if tid[-1:].isdigit():
            return "Up" if int(tid[-1]) % 2 == 0 else "Down"
    if section_id:
        sid = section_id.upper()
        if sid.endswith("UP"):
            return "Up"
        if sid.endswith("DN"):
            return "Down"
    return "Bidirectional"


def _bucket_hour(ts: datetime) -> str:
    return ts.strftime('%Y-%m-%d %H:00')


def _delay_propagation_index(db: Session, start: datetime, end: datetime) -> float:
    rows = (
        db.query(TrainLog.section_id, TrainLog.timestamp, TrainLog.delay_minutes)
        .filter(TrainLog.timestamp >= start, TrainLog.timestamp <= end, TrainLog.delay_minutes.isnot(None))
        .order_by(TrainLog.section_id, TrainLog.timestamp)
        .all()
    )
    previous_delay: Dict[str, float] = {}
    propagation_events = 0
    worsening_events = 0
    for section_id, ts, delay in rows:
        if section_id is None or delay is None:
            continue
        delay_val = float(delay)
        prev = previous_delay.get(section_id)
        if prev is not None:
            propagation_events += 1
            if delay_val >= prev:
                worsening_events += 1
        previous_delay[section_id] = delay_val
    if propagation_events == 0:
        return 0.0
    return round(min(1.0, worsening_events / propagation_events), 3)


def _generate_alerts(db: Session, lookback_minutes: int = 60) -> List[Dict[str, Any]]:
    now = _now_utc()
    start = now - timedelta(minutes=lookback_minutes)
    alerts: List[Dict[str, Any]] = []

    congestion_rows = (
        db.query(TrainPosition.section_id, func.count(func.distinct(TrainPosition.train_id)).label("active"))
        .filter(TrainPosition.timestamp >= start)
        .group_by(TrainPosition.section_id)
        .order_by(desc("active"))
        .limit(5)
        .all()
    )
    for section_id, active in congestion_rows:
        if active is None:
            continue
        zone, division = _resolve_zone(section_id)
        severity = "info"
        if active >= 25:
            severity = "critical"
        elif active >= 15:
            severity = "warning"
        if severity != "info":
            alerts.append({
                "id": f"alert-{section_id}-{int(now.timestamp())}",
                "message": f"Severe congestion detected in {section_id} ({zone})",
                "details": f"{active} trains active in last {lookback_minutes} min",
                "section_id": section_id,
                "zone": zone,
                "division": division,
                "severity": severity,
                "timestamp": now.isoformat(),
            })

    delay_rows = (
        db.query(TrainLog.train_id, TrainLog.section_id, TrainLog.delay_minutes)
        .filter(TrainLog.timestamp >= start, TrainLog.delay_minutes.isnot(None))
        .order_by(TrainLog.delay_minutes.desc())
        .limit(5)
        .all()
    )
    for train_id, section_id, delay in delay_rows:
        if not delay or delay < 10:
            continue
        zone, division = _resolve_zone(section_id)
        alerts.append({
            "id": f"alert-delay-{train_id}",
            "message": f"Train {train_id} expected +{delay} min delay",
            "details": f"Reported in {section_id or 'section'}",
            "section_id": section_id,
            "zone": zone,
            "division": division,
            "severity": "warning" if delay < 25 else "critical",
            "timestamp": now.isoformat(),
        })

    return alerts[:5]


@router.get("/summary")
def summary(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    """Return top-level KPIs for the specified window."""
    now = _now_utc()
    start = now - timedelta(hours=hours)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Throughput: distinct trains seen in TrainLog within window divided by hours
    distinct_trains = db.query(func.count(func.distinct(TrainLog.train_id))).filter(TrainLog.timestamp >= start).scalar() or 0
    throughput_per_hour = round((distinct_trains / max(1, hours)), 2)

    # Avg delay minutes from train_logs
    avg_delay = db.query(func.avg(TrainLog.delay_minutes)).filter(TrainLog.timestamp >= start).scalar() or 0.0
    avg_delay = round(float(avg_delay or 0.0), 2)

    # On-time %: proportion of logs with delay <= 5 minutes
    total_events = db.query(func.count(TrainLog.id)).filter(TrainLog.timestamp >= start).scalar() or 0
    on_time_count = db.query(func.count(TrainLog.id)).filter(TrainLog.timestamp >= start, (TrainLog.delay_minutes <= 5) | (TrainLog.delay_minutes == None)).scalar() or 0
    on_time_pct = round((on_time_count / max(1, total_events)) * 100, 2) if total_events else 0.0

    # Congestion index: active trains (positions in last 10 minutes) / assumed capacity
    active_since = now - timedelta(minutes=10)
    active_trains = db.query(func.count(func.distinct(TrainPosition.train_id))).filter(TrainPosition.timestamp >= active_since).scalar() or 0
    assumed_capacity = 50
    congestion_index = round(min(1.0, active_trains / assumed_capacity), 3)

    # Max delay today
    max_delay_row = (
        db.query(TrainLog.train_id, TrainLog.delay_minutes, TrainLog.station_id, TrainLog.timestamp)
        .filter(TrainLog.timestamp >= day_start, TrainLog.delay_minutes.isnot(None))
        .order_by(TrainLog.delay_minutes.desc())
        .first()
    )
    max_delay_info = None
    if max_delay_row:
        max_delay_info = {
            "train_id": max_delay_row.train_id,
            "delay_minutes": float(max_delay_row.delay_minutes or 0.0),
            "station_id": max_delay_row.station_id,
            "recorded_at": max_delay_row.timestamp.isoformat() if max_delay_row.timestamp else None,
        }

    # Delay propagation index over last 6 hours
    propagation_index = _delay_propagation_index(db, start=now - timedelta(hours=6), end=now)

    positions_count = db.query(TrainPosition).count()
    schedules_count = db.query(TrainSchedule).count()

    return {
        "throughput_per_hour": throughput_per_hour,
        "avg_delay_minutes": avg_delay,
        "congestion_index": congestion_index,
        "on_time_percentage": on_time_pct,
        "max_delay_today": max_delay_info,
        "delay_propagation_index": propagation_index,
        "positions_count": int(positions_count),
        "schedules_count": int(schedules_count),
        "window_hours": hours,
        "updated_at": now.isoformat(),
        "recommended_refresh_seconds": DEFAULT_REFRESH_SECONDS,
    }


@router.get("/delay-trends")
def delay_trends(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    """Return average delay grouped by hour for the given window."""
    now = _now_utc()
    start = now - timedelta(hours=hours)
    week_start = now - timedelta(days=7)

    # Use TrainLog.delay_minutes grouped by hour. Dialect-aware
    dialect = db.bind.dialect.name if db.bind is not None else "sqlite"
    if dialect == "postgresql":
        bucket_col = func.date_trunc('hour', TrainLog.timestamp).label('bucket')
    else:
        bucket_col = func.strftime('%Y-%m-%d %H:00', TrainLog.timestamp).label('bucket')

    rows = (
        db.query(bucket_col, func.avg(TrainLog.delay_minutes).label('avg_delay'))
        .filter(TrainLog.timestamp >= start)
        .group_by(bucket_col)
        .order_by(bucket_col)
        .all()
    )

    bucket_map: Dict[str, float] = {}
    for r in rows:
        key = r.bucket if not isinstance(r.bucket, datetime) else r.bucket.strftime('%Y-%m-%d %H:00')
        bucket_map[str(key)] = float(r.avg_delay or 0.0)

    labels: List[str] = []
    series: List[float] = []
    t = start.replace(minute=0, second=0, microsecond=0)
    while t <= now:
        key = t.strftime('%Y-%m-%d %H:00')
        labels.append(t.strftime('%H:%M'))
        series.append(round(bucket_map.get(key, 0.0), 2))
        t += timedelta(hours=1)

    # Last 7 days pattern
    if dialect == "postgresql":
        day_bucket = func.date_trunc('day', TrainLog.timestamp).label('day_bucket')
    else:
        day_bucket = func.strftime('%Y-%m-%d', TrainLog.timestamp).label('day_bucket')

    weekly_rows = (
        db.query(day_bucket, func.avg(TrainLog.delay_minutes).label('avg_delay'))
        .filter(TrainLog.timestamp >= week_start)
        .group_by(day_bucket)
        .order_by(day_bucket)
        .all()
    )
    weekly_map: Dict[str, float] = {}
    for r in weekly_rows:
        key = r.day_bucket if not isinstance(r.day_bucket, datetime) else r.day_bucket.strftime('%Y-%m-%d')
        weekly_map[str(key)] = float(r.avg_delay or 0.0)
    week_labels: List[str] = []
    week_series: List[float] = []
    d = week_start
    while d <= now:
        key = d.strftime('%Y-%m-%d')
        week_labels.append(d.strftime('%d %b'))
        week_series.append(round(weekly_map.get(key, 0.0), 2))
        d += timedelta(days=1)

    # Type & direction breakdown
    type_rows = (
        db.query(
            Train.class_type,
            TrainLog.section_id,
            func.avg(TrainLog.delay_minutes).label('avg_delay'),
            func.count(TrainLog.id).label('events'),
        )
        .join(Train, Train.id == TrainLog.train_id, isouter=True)
        .filter(TrainLog.timestamp >= start, TrainLog.delay_minutes.isnot(None))
        .group_by(Train.class_type, TrainLog.section_id)
        .all()
    )
    type_breakdown: List[Dict[str, Any]] = []
    for class_type, section_id, avg_delay_row, events in type_rows:
        direction = _infer_direction(None, section_id)
        type_breakdown.append({
            "type": class_type or "Passenger",
            "section_id": section_id,
            "direction": direction,
            "avg_delay": round(float(avg_delay_row or 0.0), 2),
            "sample_size": int(events or 0),
        })

    # Division-wise comparison
    division_rows = (
        db.query(
            TrainLog.section_id,
            func.avg(TrainLog.delay_minutes).label('avg_delay'),
            func.count(TrainLog.id).label('events'),
        )
        .filter(TrainLog.timestamp >= start, TrainLog.delay_minutes.isnot(None))
        .group_by(TrainLog.section_id)
        .all()
    )
    division_data: List[Dict[str, Any]] = []
    for section_id, avg_delay_row, events in division_rows:
        zone, division = _resolve_zone(section_id)
        division_data.append({
            "section_id": section_id,
            "zone": zone,
            "division": division,
            "avg_delay": round(float(avg_delay_row or 0.0), 2),
            "samples": int(events or 0),
        })

    return {
        "labels": labels,
        "series": series,
        "hourly": {"labels": labels, "series": series},
        "last7days": {"labels": week_labels, "series": week_series},
        "by_type": type_breakdown,
        "division_comparison": division_data,
    }


@router.get("/throughput-comparison")
def throughput_comparison(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    """Compare throughput by train type and provide AI optimization insights."""
    now = _now_utc()
    start = now - timedelta(hours=hours)

    rows = (
        db.query(Train.class_type, func.count(TrainLog.id))
        .join(Train, Train.id == TrainLog.train_id, isouter=True)
        .filter(TrainLog.timestamp >= start)
        .group_by(Train.class_type)
        .all()
    )

    data = []
    for class_type, cnt in rows:
        data.append({"type": class_type or 'Unknown', "throughput": int(cnt)})

    if not data:
        data = [
            {"type": "Express", "throughput": 12},
            {"type": "Freight", "throughput": 9},
            {"type": "Local", "throughput": 15},
        ]

    # Actual vs AI optimized throughput (hourly)
    dialect = db.bind.dialect.name if db.bind is not None else "sqlite"
    if dialect == "postgresql":
        bucket_col = func.date_trunc('hour', TrainLog.timestamp).label('bucket')
    else:
        bucket_col = func.strftime('%Y-%m-%d %H:00', TrainLog.timestamp).label('bucket')

    hourly_rows = (
        db.query(bucket_col, func.count(func.distinct(TrainLog.train_id)).label('cnt'))
        .filter(TrainLog.timestamp >= start)
        .group_by(bucket_col)
        .order_by(bucket_col)
        .all()
    )
    actual_vs_ai: List[Dict[str, Any]] = []
    for r in hourly_rows[-12:]:
        key = r.bucket if not isinstance(r.bucket, datetime) else r.bucket.strftime('%Y-%m-%d %H:00')
        actual = int(r.cnt or 0)
        optimized = round(actual * 1.08 + 2, 2)  # heuristic uplift
        actual_vs_ai.append({
            "bucket": key,
            "label": key[-5:],
            "actual": actual,
            "optimized": optimized,
        })

    # Real vs simulated throughput for reporting period
    real_total = sum(item.get("throughput", 0) for item in data)
    simulated_total = round(real_total * 1.05 + 5, 2)
    real_vs_simulated = [
        {"label": "Current Ops", "value": real_total},
        {"label": "AI Simulated", "value": simulated_total},
    ]

    # Division-wise throughput using positions
    division_rows = (
        db.query(TrainPosition.section_id, func.count(TrainPosition.id).label('events'))
        .filter(TrainPosition.timestamp >= start)
        .group_by(TrainPosition.section_id)
        .all()
    )
    division_throughput: List[Dict[str, Any]] = []
    for section_id, events in division_rows:
        zone, division = _resolve_zone(section_id)
        division_throughput.append({
            "section_id": section_id,
            "zone": zone,
            "division": division,
            "value": int(events or 0),
        })

    # Hourly throughput heatmap (last 7 days vs 24 hours)
    hours_axis = [f"{h:02d}:00" for h in range(24)]
    days_axis = []
    matrix: List[List[float]] = []
    origin = now - timedelta(days=6)
    for day_offset in range(7):
        day = (origin + timedelta(days=day_offset)).replace(hour=0, minute=0, second=0, microsecond=0)
        days_axis.append(day.strftime('%d %b'))
        row: List[float] = []
        for hour in range(24):
            slot_start = day + timedelta(hours=hour)
            slot_end = slot_start + timedelta(hours=1)
            count = (
                db.query(func.count(TrainLog.id))
                .filter(TrainLog.timestamp >= slot_start, TrainLog.timestamp < slot_end)
                .scalar()
            ) or 0
            row.append(round(float(count), 2))
        matrix.append(row)

    return {
        "data": data,
        "actual_vs_ai": actual_vs_ai,
        "real_vs_simulated": real_vs_simulated,
        "division_throughput": division_throughput,
        "hourly_heatmap": {
            "xLabels": hours_axis,
            "yLabels": days_axis,
            "data": matrix,
        },
    }


@router.get("/bottlenecks")
def bottlenecks(
    hours: int = Query(24, ge=1, le=168),
    top_n: int = Query(10, ge=1, le=50),
    buckets: int = Query(6, ge=2, le=24),
    db: Session = Depends(get_db),
) -> dict:
    """Return stations/sections with the highest delay ratio in the window plus bottleneck scores."""
    now = _now_utc()
    start = now - timedelta(hours=hours)

    logs = (
        db.query(
            TrainLog.section_id,
            TrainLog.station_id,
            TrainLog.train_id,
            TrainLog.delay_minutes,
            TrainLog.timestamp,
        )
        .filter(TrainLog.timestamp >= start, TrainLog.delay_minutes.isnot(None))
        .all()
    )

    sections: Dict[str, Dict[str, Any]] = {}
    heatmap_map: Dict[Tuple[str, str], List[float]] = defaultdict(list)
    train_delay_map: Dict[Tuple[str, str], List[float]] = defaultdict(list)

    for section_id, station_id, train_id, delay, ts in logs:
        section_key = section_id or "Unknown"
        section_entry = sections.setdefault(section_key, {
            "section_id": section_key,
            "stations": set(),
            "total_events": 0,
            "delay_events": 0,
            "max_delay": 0.0,
            "avg_accumulator": [],
            "time_slots": defaultdict(int),
            "station_counts": defaultdict(int),
        })
        section_entry["total_events"] += 1
        section_entry["stations"].add(station_id or "Unknown")
        delay_val = float(delay or 0.0)
        section_entry["avg_accumulator"].append(delay_val)
        if delay_val > section_entry["max_delay"]:
            section_entry["max_delay"] = delay_val
        if delay_val > 5:
            section_entry["delay_events"] += 1
        slot = ts.strftime('%H:00') if ts else "Unknown"
        section_entry["time_slots"][slot] += 1
        if station_id:
            section_entry["station_counts"][station_id] += 1
        if train_id:
            train_delay_map[(section_key, train_id)].append(delay_val)
        bucket = _bucket_hour(ts) if ts else "Unknown"
        heatmap_map[(section_key, bucket)].append(delay_val)

    # Congestion data
    congestion_rows = (
        db.query(TrainPosition.section_id, func.count(func.distinct(TrainPosition.train_id)).label("active"))
        .filter(TrainPosition.timestamp >= start)
        .group_by(TrainPosition.section_id)
        .all()
    )
    congestion_map = {section_id or "Unknown": int(active or 0) for section_id, active in congestion_rows}

    bottleneck_list: List[Dict[str, Any]] = []
    for section_id, info in sections.items():
        zone, division = _resolve_zone(section_id)
        avg_delay = round(mean(info["avg_accumulator"]) if info["avg_accumulator"] else 0.0, 2)
        most_train = None
        highest_avg = 0.0
        for (sec, train), delays in train_delay_map.items():
            if sec != section_id or not delays:
                continue
            candidate = sum(delays) / len(delays)
            if candidate > highest_avg:
                highest_avg = candidate
                most_train = train
        slot_counts = info["time_slots"]
        peak_slot = max(slot_counts.items(), key=lambda x: x[1])[0] if slot_counts else None
        congestion = congestion_map.get(section_id, 0)
        bottleneck_score = round(min(10.0, (avg_delay / 5.0) * 3 + (info["delay_events"] / max(1, info["total_events"])) * 4 + min(congestion / 5.0, 3)), 2)
        bottleneck_list.append({
            "section_id": section_id,
            "zone": zone,
            "division": division,
            "stations": sorted(info["stations"]),
            "no_of_delays": int(info["delay_events"]),
            "total_events": int(info["total_events"]),
            "avg_delay": avg_delay,
            "max_delay": info["max_delay"],
            "max_congestion": congestion,
            "most_delayed_train": most_train,
            "time_slot": peak_slot,
            "bottleneck_score": bottleneck_score,
        })

    if not bottleneck_list:
        bottleneck_list = [
            {
                "section_id": "KALYAN-KASARA",
                "zone": "CR Zone",
                "division": "Mumbai",
                "stations": ["Kalyan", "Kasara"],
                "no_of_delays": 9,
                "total_events": 20,
                "avg_delay": 12.5,
                "max_delay": 28.0,
                "max_congestion": 18,
                "most_delayed_train": "22159",
                "time_slot": "18:00",
                "bottleneck_score": 8.4,
            }
        ]

    bottleneck_list.sort(key=lambda x: x.get("bottleneck_score", 0), reverse=True)
    bottleneck_list = bottleneck_list[:top_n]

    # Heatmap data for visualization (top sections vs latest buckets)
    bucket_points = []
    for i in range(buckets):
        bucket_time = (now - timedelta(hours=buckets - i)).replace(minute=0, second=0, microsecond=0)
        bucket_points.append(_bucket_hour(bucket_time))
    heatmap_rows: List[List[float]] = []
    for section in bottleneck_list:
        row: List[float] = []
        for bucket in bucket_points:
            delays = heatmap_map.get((section["section_id"], bucket), [])
            row.append(round(mean(delays), 2) if delays else 0.0)
        heatmap_rows.append(row)

    return {
        "bottlenecks": bottleneck_list,
        "heatmap": {
            "xLabels": [bp[-5:] for bp in bucket_points],
            "yLabels": [section["section_id"] for section in bottleneck_list],
            "data": heatmap_rows,
        },
    }


@router.get("/zone-summary")
def zone_summary(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    """Return aggregated KPIs for each zone and division."""
    now = _now_utc()
    start = now - timedelta(hours=hours)

    zone_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"delay_values": [], "running_trains": 0, "congestion": 0.0})
    division_stats: Dict[Tuple[str, str], Dict[str, Any]] = defaultdict(lambda: {"delay_values": [], "running_trains": 0, "congestion": 0.0})

    delay_rows = (
        db.query(
            TrainLog.section_id,
            func.avg(TrainLog.delay_minutes).label('avg_delay'),
            func.count(func.distinct(TrainLog.train_id)).label('train_count'),
        )
        .filter(TrainLog.timestamp >= start, TrainLog.delay_minutes.isnot(None))
        .group_by(TrainLog.section_id)
        .all()
    )

    for section_id, avg_delay_row, train_count in delay_rows:
        zone, division = _resolve_zone(section_id)
        avg_val = float(avg_delay_row or 0.0)
        zone_entry = zone_stats[zone]
        zone_entry["delay_values"].append(avg_val)
        zone_entry["running_trains"] += int(train_count or 0)

        div_entry = division_stats[(zone, division)]
        div_entry["delay_values"].append(avg_val)
        div_entry["running_trains"] += int(train_count or 0)

    # Congestion from live positions (last 30 minutes)
    position_rows = (
        db.query(TrainPosition.section_id, func.count(func.distinct(TrainPosition.train_id)).label("active"))
        .filter(TrainPosition.timestamp >= now - timedelta(minutes=30))
        .group_by(TrainPosition.section_id)
        .all()
    )
    for section_id, active in position_rows:
        zone, division = _resolve_zone(section_id)
        zone_stats[zone]["congestion"] += float(active or 0)
        division_stats[(zone, division)]["congestion"] += float(active or 0)

    zones_payload = []
    for zone, info in zone_stats.items():
        avg_delay = round(mean(info["delay_values"]) if info["delay_values"] else 0.0, 2)
        congestion = round(info["congestion"] / max(1, len(info["delay_values"])), 2) if info["delay_values"] else 0.0
        zones_payload.append({
            "zone": zone,
            "avg_delay": avg_delay,
            "running_trains": info["running_trains"],
            "congestion_level": congestion,
        })

    divisions_payload = []
    for (zone, division), info in division_stats.items():
        avg_delay = round(mean(info["delay_values"]) if info["delay_values"] else 0.0, 2)
        congestion = round(info["congestion"] / max(1, len(info["delay_values"])), 2) if info["delay_values"] else 0.0
        divisions_payload.append({
            "zone": zone,
            "division": division,
            "running_trains": info["running_trains"],
            "avg_delay": avg_delay,
            "congestion_level": congestion,
        })

    if not zones_payload:
        zones_payload = [
            {"zone": "CR Zone", "avg_delay": 12, "running_trains": 58, "congestion_level": 0.72},
            {"zone": "WR Zone", "avg_delay": 5, "running_trains": 44, "congestion_level": 0.43},
            {"zone": "SECR Zone", "avg_delay": 7, "running_trains": 32, "congestion_level": 0.55},
        ]
    if not divisions_payload:
        divisions_payload = [
            {"zone": "CR Zone", "division": "Mumbai", "running_trains": 24, "avg_delay": 14, "congestion_level": 0.78},
            {"zone": "CR Zone", "division": "Nagpur", "running_trains": 18, "avg_delay": 9, "congestion_level": 0.61},
            {"zone": "WR Zone", "division": "Mumbai Central", "running_trains": 20, "avg_delay": 4, "congestion_level": 0.38},
        ]

    return {
        "zones": zones_payload,
        "divisions": divisions_payload,
        "updated_at": now.isoformat(),
    }


@router.get("/ai-recommendations")
def ai_recommendations(limit: int = Query(8, ge=1, le=20), db: Session = Depends(get_db)) -> dict:
    """Generate AI recommendations report from recent logs."""
    now = _now_utc()
    start = now - timedelta(hours=6)
    logs = (
        db.query(
            TrainLog.train_id,
            TrainLog.section_id,
            TrainLog.station_id,
            TrainLog.delay_minutes,
            TrainLog.timestamp,
        )
        .filter(TrainLog.timestamp >= start, TrainLog.delay_minutes.isnot(None))
        .order_by(TrainLog.delay_minutes.desc())
        .limit(limit * 2)
        .all()
    )

    recommendations: List[Dict[str, Any]] = []
    for log in logs:
        if not log.train_id:
            continue
        action, reason = random.choice(AI_ACTIONS)
        delay_val = float(log.delay_minutes or 0.0)
        delay_saved = round(max(delay_val - random.uniform(1, 5), 0), 2)
        recommendations.append({
            "time": log.timestamp.isoformat() if log.timestamp else now.isoformat(),
            "train": log.train_id,
            "section_id": log.section_id,
            "station_id": log.station_id,
            "action": action,
            "reason": reason,
            "delay": delay_val,
            "delay_saved": delay_saved,
        })
        if len(recommendations) >= limit:
            break

    if not recommendations:
        recommendations = [
            {"time": now.isoformat(), "train": "22159", "section_id": "KALYAN-KASARA", "station_id": "KYN", "action": "Hold 2 mins", "reason": "Crossing conflict", "delay": 14.2, "delay_saved": 4.2},
            {"time": now.isoformat(), "train": "11009", "section_id": "THANE-DADAR", "station_id": "DR", "action": "Reroute to loop", "reason": "Signal block", "delay": 11.0, "delay_saved": 3.1},
        ]

    total_saved = round(sum(item.get("delay_saved", 0) for item in recommendations), 2)

    return {
        "recommendations": recommendations,
        "summary": {
            "total_recommendations": len(recommendations),
            "total_delay_saved": total_saved,
            "generated_at": now.isoformat(),
        },
    }


@router.get("/throughput-delay-correlation")
def throughput_delay_correlation(hours: int = Query(24, ge=6, le=168), db: Session = Depends(get_db)) -> dict:
    """Return scatter plot data for throughput vs delay impact analysis."""
    now = _now_utc()
    start = now - timedelta(hours=hours)

    rows = (
        db.query(
            TrainLog.section_id,
            func.count(func.distinct(TrainLog.train_id)).label('throughput'),
            func.avg(TrainLog.delay_minutes).label('avg_delay'),
        )
        .filter(TrainLog.timestamp >= start, TrainLog.delay_minutes.isnot(None))
        .group_by(TrainLog.section_id)
        .all()
    )

    points: List[Dict[str, Any]] = []
    x_vals: List[float] = []
    y_vals: List[float] = []
    for section_id, throughput_row, avg_delay_row in rows:
        throughput_val = float(throughput_row or 0.0)
        delay_val = round(float(avg_delay_row or 0.0), 2)
        zone, division = _resolve_zone(section_id)
        points.append({
            "section_id": section_id,
            "zone": zone,
            "division": division,
            "throughput": throughput_val,
            "avg_delay": delay_val,
        })
        x_vals.append(throughput_val)
        y_vals.append(delay_val)

    if not points:
        points = [
            {"section_id": "KALYAN-KASARA", "zone": "CR Zone", "division": "Mumbai", "throughput": 32, "avg_delay": 14},
            {"section_id": "THANE-DADAR", "zone": "CR Zone", "division": "Mumbai", "throughput": 28, "avg_delay": 8},
            {"section_id": "WR-001", "zone": "WR Zone", "division": "Mumbai Central", "throughput": 24, "avg_delay": 5},
        ]
        x_vals = [p["throughput"] for p in points]
        y_vals = [p["avg_delay"] for p in points]

    # Simple linear regression metrics
    if len(points) >= 2:
        mean_x = sum(x_vals) / len(x_vals)
        mean_y = sum(y_vals) / len(y_vals)
        numerator = sum((x - mean_x) * (y - mean_y) for x, y in zip(x_vals, y_vals))
        denominator = sum((x - mean_x) ** 2 for x in x_vals) or 1.0
        slope = numerator / denominator
        intercept = mean_y - slope * mean_x
        # r-squared
        ss_tot = sum((y - mean_y) ** 2 for y in y_vals) or 1.0
        ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(x_vals, y_vals))
        r_squared = max(0.0, 1 - ss_res / ss_tot)
    else:
        slope = 0.0
        intercept = 0.0
        r_squared = 0.0

    return {
        "points": points,
        "trendline": {
            "slope": round(slope, 4),
            "intercept": round(intercept, 2),
            "r_squared": round(r_squared, 3),
        },
        "updated_at": now.isoformat(),
    }


@router.get("/disruption-impact")
def disruption_impact(db: Session = Depends(get_db)) -> dict:
    """Return disruption impact report from last simulation runs."""
    from app.services.simulator import simulator_service

    runs = simulator_service.get_recent_runs()
    scenarios = []
    for run in reversed(runs):
        result = run.get("result", {})
        metrics = result.get("metrics", {})
        disruptions = run.get("scenario", {}).get("disruptions", [])
        table_rows = []
        for disruption in disruptions:
            table_rows.append({
                "disruption": disruption.get("type", "disruption").replace("_", " ").title(),
                "impact": disruption.get("severity", "medium").title(),
                "delay_caused": round((metrics.get("total_delay_minutes", 0) / max(1, len(disruptions))), 1),
                "trains_affected": len(result.get("impacted_trains", [])),
            })
        before = metrics.get("total_delay_minutes", 0)
        after = round(max(before - before * 0.35, 0), 1)
        scenarios.append({
            "id": run.get("id"),
            "name": run.get("name"),
            "generated_at": run.get("timestamp"),
            "table": table_rows or [
                {"disruption": "Track Block", "impact": "High", "delay_caused": 25, "trains_affected": 7},
                {"disruption": "Signal Failure", "impact": "Medium", "delay_caused": 10, "trains_affected": 3},
            ],
            "before_after": [
                {"metric": "Total Delay (min)", "before": before, "after": after},
                {"metric": "Throughput Impact (%)", "before": metrics.get("throughput_impact_percent", 0), "after": max(metrics.get("throughput_impact_percent", 0) - 12, 0)},
            ],
        })

    if not scenarios:
        scenarios = [
            {
                "id": "sim-demo",
                "name": "Evening Peak Disruption",
                "generated_at": _now_utc().isoformat(),
                "table": [
                    {"disruption": "Track Block", "impact": "High", "delay_caused": 25, "trains_affected": 7},
                    {"disruption": "Signal Failure", "impact": "Medium", "delay_caused": 10, "trains_affected": 3},
                ],
                "before_after": [
                    {"metric": "Total Delay (min)", "before": 120, "after": 78},
                    {"metric": "Throughput Impact (%)", "before": 25, "after": 12},
                ],
            }
        ]

    return {
        "scenarios": scenarios,
        "count": len(scenarios),
    }


@router.get("/alerts")
def alerts(db: Session = Depends(get_db)) -> dict:
    """Return recent real-time alerts for reports page."""
    alerts_payload = _generate_alerts(db)
    if not alerts_payload:
        now = _now_utc()
        alerts_payload = [
            {"id": "alert-demo-1", "message": "Severe congestion detected in Kalyan–Kasara section", "details": "19 trains active in last 30 min", "section_id": "KALYAN-KASARA", "zone": "CR Zone", "division": "Mumbai", "severity": "critical", "timestamp": now.isoformat()},
            {"id": "alert-demo-2", "message": "Train 12110 expected +12 delay due to signal failure", "details": "Reported near Dadar", "section_id": "THANE-DADAR", "zone": "CR Zone", "division": "Mumbai", "severity": "warning", "timestamp": now.isoformat()},
        ]
    return {"alerts": alerts_payload}


@router.get("/train-report/{train_id}")
def train_report(train_id: str, hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    """Return detailed train movement log for a specific train."""
    now = _now_utc()
    start = now - timedelta(hours=hours)
    logs = (
        db.query(
            TrainLog.station_id,
            TrainLog.section_id,
            TrainLog.event_type,
            TrainLog.planned_time,
            TrainLog.actual_time,
            TrainLog.delay_minutes,
            TrainLog.status,
        )
        .filter(TrainLog.train_id == train_id, TrainLog.timestamp >= start)
        .order_by(TrainLog.timestamp)
        .all()
    )
    positions = (
        db.query(TrainPosition.section_id, TrainPosition.location_km, TrainPosition.speed_kmph, TrainPosition.timestamp)
        .filter(TrainPosition.train_id == train_id, TrainPosition.timestamp >= start)
        .order_by(TrainPosition.timestamp)
        .all()
    )

    timeline = []
    delay_profile = []
    for log in logs:
        entry = {
            "station_id": log.station_id,
            "section_id": log.section_id,
            "event_type": log.event_type,
            "planned_time": log.planned_time.isoformat() if log.planned_time else None,
            "actual_time": log.actual_time.isoformat() if log.actual_time else None,
            "delay_minutes": float(log.delay_minutes or 0),
            "status": log.status,
        }
        timeline.append(entry)
        delay_profile.append({
            "station_id": log.station_id,
            "delay": float(log.delay_minutes or 0),
        })

    speed_profile = [
        {
            "section_id": pos.section_id,
            "location_km": round(float(pos.location_km or 0), 2),
            "speed_kmph": round(float(pos.speed_kmph or 0), 1),
            "timestamp": pos.timestamp.isoformat() if pos.timestamp else None,
        }
        for pos in positions
    ]

    conflicts = []
    for log in timeline:
        delay_val = log.get("delay_minutes", 0)
        if delay_val and delay_val > 10:
            conflicts.append({
                "section_id": log.get("section_id"),
                "station_id": log.get("station_id"),
                "type": "delay_propagation",
                "description": f"Delay of {delay_val} min may impact following trains",
            })

    ai_actions = []
    for idx, log in enumerate(timeline[:3]):
        action, reason = AI_ACTIONS[idx % len(AI_ACTIONS)]
        ai_actions.append({
            "station_id": log.get("station_id"),
            "action": action,
            "reason": reason,
            "applied": random.choice([True, False]),
        })

    if not timeline:
        now_str = now.isoformat()
        timeline = [
            {"station_id": "KYN", "section_id": "KALYAN-KASARA", "event_type": "arrival", "planned_time": now_str, "actual_time": now_str, "delay_minutes": 0, "status": "on_time"}
        ]
        speed_profile = [{"section_id": "KALYAN-KASARA", "location_km": 42.5, "speed_kmph": 58.0, "timestamp": now_str}]
        ai_actions = [
            {"station_id": "KYN", "action": "Hold 2 mins", "reason": "Balancing crossing", "applied": True},
        ]

    return {
        "train_id": train_id,
        "timeline": timeline,
        "delay_profile": delay_profile,
        "speed_profile": speed_profile,
        "conflicts": conflicts,
        "ai_actions": ai_actions,
        "generated_at": now.isoformat(),
    }


@router.get("/export/csv")
def export_csv(report: str = Query("summary"), hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)):
    """Export requested report as CSV. report can be: summary, delay-trends, throughput, bottlenecks"""
    report = (report or "summary").lower()

    buf = io.StringIO()
    writer = csv.writer(buf)

    if report == 'summary':
        s = summary(hours=hours, db=db)
        writer.writerow(['metric', 'value'])
        for k, v in s.items():
            writer.writerow([k, v])
    elif report in ('delay', 'delay-trends', 'delay_trends'):
        d = delay_trends(hours=hours, db=db)
        writer.writerow(['hour', 'avg_delay_minutes'])
        for i in range(len(d['labels'])):
            writer.writerow([d['labels'][i], d['series'][i]])
    elif report in ('throughput', 'throughput-comparison'):
        t = throughput_comparison(hours=hours, db=db)
        writer.writerow(['type', 'throughput'])
        for row in t['data']:
            writer.writerow([row.get('type'), row.get('throughput')])
    elif report in ('bottlenecks', 'hotspots'):
        b = bottlenecks(hours=hours, db=db)
        writer.writerow(['station_id', 'station_name', 'total', 'delayed', 'delay_ratio'])
        for row in b['bottlenecks']:
            writer.writerow([row.get('station_id'), row.get('station_name'), row.get('total'), row.get('delayed'), row.get('delay_ratio')])
    else:
        raise HTTPException(status_code=400, detail='Unknown report type')

    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type='text/csv', headers={'Content-Disposition': f'attachment; filename="{report}.csv"'})


@router.get("/export/pdf")
def export_pdf(report: str = Query("summary"), hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)):
    """Generate a simple PDF report. Requires reportlab to be installed. If not available, return 501."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
    except Exception:
        raise HTTPException(status_code=501, detail="PDF export requires 'reportlab' package. Install it server-side to enable PDF generation.")

    # Build a very simple PDF in-memory
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    text = c.beginText(40, 750)
    text.setFont('Helvetica', 12)
    text.textLine('RailAnukriti Reports')
    text.textLine('')
    if report == 'summary':
        s = summary(hours=hours, db=db)
        for k, v in s.items():
            text.textLine(f'{k}: {v}')
    else:
        text.textLine(f'Report type "{report}" not implemented in PDF generator; use CSV or extend the endpoint')
    c.drawText(text)
    c.showPage()
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="{report}.pdf"'})


# Backwards-compatible endpoints (previous names)
@router.get("/kpis")
def get_kpis(db: Session = Depends(get_db)) -> dict:
    return summary(hours=24, db=db)


@router.get("/kpi")
def get_kpi(db: Session = Depends(get_db)) -> dict:
    return summary(hours=24, db=db)


@router.get("/delay_trends")
def delay_trends_compat(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    return delay_trends(hours=hours, db=db)


@router.get("/throughput")
def throughput_compat(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    return throughput_comparison(hours=hours, db=db)


@router.get("/hotspots")
def hotspots_compat(hours: int = Query(24, ge=1, le=168), top_sections: int = Query(4, ge=1, le=12), buckets: int = Query(5, ge=2, le=24), db: Session = Depends(get_db)) -> dict:
    # Keep previous hotspots behaviour (grid) by mapping to bottlenecks for now
    return bottlenecks(hours=hours, top_n=top_sections, buckets=buckets, db=db)
