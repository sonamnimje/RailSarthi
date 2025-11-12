from dataclasses import dataclass
from typing import List, Dict, Any, Tuple
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.db.models import TrainLog, TrainSchedule, TrainPosition


@dataclass
class OptimizerConfig:
	use_rl: bool = True
	use_or: bool = True
	use_gnn: bool = True


class OptimizerService:
	def __init__(self, config: OptimizerConfig | None = None) -> None:
		self.config = config or OptimizerConfig()

	def _recent_delays_by_train(self, db: Session, lookback_hours: int) -> Dict[str, float]:
		now = datetime.now(timezone.utc)
		start = now - timedelta(hours=lookback_hours)
		rows = (
			db.query(TrainLog.train_id, TrainLog.delay_minutes)
			.filter(TrainLog.timestamp >= start)
			.filter(TrainLog.delay_minutes.isnot(None))
			.all()
		)
		totals: Dict[str, Tuple[int, int]] = {}
		for train_id, delay in rows:
			if train_id not in totals:
				totals[train_id] = (0, 0)
			s, c = totals[train_id]
			totals[train_id] = (s + int(delay or 0), c + 1)
		avg: Dict[str, float] = {k: (s / c if c > 0 else 0.0) for k, (s, c) in totals.items()}
		return avg

	def _section_congestion(self, db: Session, section_id: str, window_minutes: int) -> int:
		now = datetime.now(timezone.utc)
		start = now - timedelta(minutes=window_minutes)
		cnt = (
			db.query(TrainPosition.train_id)
			.filter(TrainPosition.section_id == section_id)
			.filter(TrainPosition.timestamp >= start)
			.distinct()
			.count()
		)
		return int(cnt)

	def _platform_conflicts(self, db: Session, window_minutes: int) -> Dict[str, str]:
		# naive: if two trains use same planned_platform at same station within 5 minutes
		now = datetime.now(timezone.utc)
		start = now - timedelta(minutes=window_minutes)
		rows = (
			db.query(TrainSchedule.train_id, TrainSchedule.station_id, TrainSchedule.planned_platform, TrainSchedule.planned_departure)
			.filter(TrainSchedule.planned_departure.isnot(None))
			.filter(TrainSchedule.planned_departure >= start)
			.all()
		)
		conflicts: Dict[str, str] = {}
		by_key: Dict[Tuple[str, str], List[Tuple[str, datetime]]] = {}
		for train_id, station_id, platform, dep in rows:
			if not platform or not dep:
				continue
			key = (station_id, platform)
			by_key.setdefault(key, []).append((train_id, dep))
		for (_station, _plat), items in by_key.items():
			items.sort(key=lambda x: x[1])
			for i in range(1, len(items)):
				t_prev, ts_prev = items[i - 1]
				t_curr, ts_curr = items[i]
				if (ts_curr - ts_prev).total_seconds() <= 5 * 60:
					conflicts[t_prev] = _plat
					conflicts[t_curr] = _plat
		return conflicts

	def _latest_delay_for_train(self, db: Session, train_id: str, lookback_minutes: int = 60) -> float:
		now = datetime.now(timezone.utc)
		start = now - timedelta(minutes=lookback_minutes)
		row = (
			db.query(TrainLog.delay_minutes)
			.filter(TrainLog.train_id == train_id)
			.filter(TrainLog.timestamp >= start)
			.order_by(TrainLog.timestamp.desc())
			.first()
		)
		if row and row[0] is not None:
			return float(row[0])
		return 0.0

	def optimize(self, request: Dict[str, Any], db: Session) -> Dict[str, Any]:
		section_id: str = request.get("section_id", "")
		lookahead_minutes: int = int(request.get("lookahead_minutes", 30))

		avg_delay = self._recent_delays_by_train(db, lookback_hours=max(1, lookahead_minutes // 60 or 1))
		congestion = self._section_congestion(db, section_id=section_id, window_minutes=lookahead_minutes)
		platform_conf = self._platform_conflicts(db, window_minutes=lookahead_minutes)

		now = datetime.now(timezone.utc)
		start = now - timedelta(minutes=lookahead_minutes)
		pos_rows = (
			db.query(TrainPosition.train_id)
			.filter(TrainPosition.section_id == section_id)
			.filter(TrainPosition.timestamp >= start)
			.distinct()
			.all()
		)
		candidate_trains = [r[0] for r in pos_rows]

		recommendations: List[Dict[str, Any]] = []
		explanations: List[str] = []

		for train_id in candidate_trains:
			score = 0.0
			reason_bits: List[str] = []

			d = avg_delay.get(train_id, 0.0)
			if d > 0:
				add = min(d / 10.0, 1.0) * 0.5
				score += add
				reason_bits.append(f"historical delay {d:.1f}m (score +{add:.2f})")

			live_d = self._latest_delay_for_train(db, train_id, lookback_minutes=max(15, lookahead_minutes))
			if live_d > 0:
				add_live = min(live_d / 15.0, 1.0) * 0.3
				score += add_live
				reason_bits.append(f"live delay {live_d:.1f}m (score +{add_live:.2f})")

			if train_id in platform_conf:
				score += 0.3
				reason_bits.append(f"platform conflict at P{platform_conf[train_id]} (score +0.30)")

			if congestion >= 3:
				add = min((congestion - 2) * 0.1, 0.3)
				score += add
				reason_bits.append(f"section congestion {congestion} trains (score +{add:.2f})")

			action = "give_precedence" if score >= 0.4 else "hold_for_clearance"
			recommendations.append({
				"train_id": train_id,
				"action": action,
				"reason": "; ".join(reason_bits) or "balancing throughput and punctuality",
				"priority_score": round(min(score, 1.0), 2),
				"platform": platform_conf.get(train_id),
			})

		recommendations.sort(key=lambda r: r.get("priority_score", 0), reverse=True)
		recommendations = recommendations[:5]
		explanations.append("Heuristic: score = delay_factor + platform_conflict + congestion_factor")

		return {"recommendations": recommendations, "explanations": explanations}


optimizer_service = OptimizerService()


