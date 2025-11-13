from fastapi import APIRouter, Depends, Query, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from .users import require_role
from app.db.session import get_db
from app.db.models import TrainPosition, TrainSchedule, Train, TrainLog, Station
import os
import json
import io
import csv
from typing import List, Dict, Any

router = APIRouter(dependencies=[Depends(require_role("controller", "admin"))])


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/summary")
def summary(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    """Return top-level KPIs for the specified window."""
    now = _now_utc()
    start = now - timedelta(hours=hours)

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

    positions_count = db.query(TrainPosition).count()
    schedules_count = db.query(TrainSchedule).count()

    return {
        "throughput_per_hour": throughput_per_hour,
        "avg_delay_minutes": avg_delay,
        "congestion_index": congestion_index,
        "on_time_percentage": on_time_pct,
        "positions_count": int(positions_count),
        "schedules_count": int(schedules_count),
        "window_hours": hours,
    }


@router.get("/delay-trends")
def delay_trends(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    """Return average delay grouped by hour for the given window."""
    now = _now_utc()
    start = now - timedelta(hours=hours)

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

    return {"labels": labels, "series": series}


@router.get("/throughput-comparison")
def throughput_comparison(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    """Compare throughput by train type (class_type)."""
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

    return {"data": data}


@router.get("/bottlenecks")
def bottlenecks(hours: int = Query(24, ge=1, le=168), top_n: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)) -> dict:
    """Return stations/sections with the highest delay ratio in the window."""
    now = _now_utc()
    start = now - timedelta(hours=hours)

    # Group by station_id in TrainLog
    total_per_station = db.query(TrainLog.station_id, func.count(TrainLog.id).label('total'))
    total_per_station = total_per_station.filter(TrainLog.timestamp >= start).group_by(TrainLog.station_id).subquery()

    delayed_per_station = db.query(TrainLog.station_id, func.count(TrainLog.id).label('delayed'))
    delayed_per_station = delayed_per_station.filter(TrainLog.timestamp >= start, TrainLog.delay_minutes > 5).group_by(TrainLog.station_id).subquery()

    rows = (
        db.query(total_per_station.c.station_id, total_per_station.c.total, func.coalesce(delayed_per_station.c.delayed, 0).label('delayed'))
        .outerjoin(delayed_per_station, delayed_per_station.c.station_id == total_per_station.c.station_id)
        .order_by(func.coalesce(delayed_per_station.c.delayed, 0).desc())
        .limit(top_n)
        .all()
    )

    out = []
    for station_id, total, delayed in rows:
        ratio = round((delayed / max(1, total)), 3) if total else 0.0
        # Try to resolve station name
        station = db.query(Station).filter(Station.id == station_id).first() if station_id else None
        out.append({"station_id": station_id or 'Unknown', "station_name": station.name if station else None, "total": int(total), "delayed": int(delayed), "delay_ratio": ratio})

    if not out:
        out = [
            {"station_id": "S1", "station_name": "S1", "total": 100, "delayed": 20, "delay_ratio": 0.2},
            {"station_id": "S2", "station_name": "S2", "total": 80, "delayed": 40, "delay_ratio": 0.5},
        ]

    return {"bottlenecks": out}


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


@router.get("/delay_trends")
def delay_trends_compat(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    return delay_trends(hours=hours, db=db)


@router.get("/throughput")
def throughput_compat(hours: int = Query(24, ge=1, le=168), db: Session = Depends(get_db)) -> dict:
    return throughput_comparison(hours=hours, db=db)


@router.get("/hotspots")
def hotspots_compat(hours: int = Query(24, ge=1, le=168), top_sections: int = Query(4, ge=1, le=12), buckets: int = Query(5, ge=2, le=24), db: Session = Depends(get_db)) -> dict:
    # Keep previous hotspots behaviour (grid) by mapping to bottlenecks for now
    return bottlenecks(hours=hours, top_n=top_sections, db=db)
