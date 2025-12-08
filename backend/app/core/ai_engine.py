"""
Lightweight AI/KPI engine for time–distance simulation.
Calculates KPI metrics and provides simple rule-based delay predictions.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime


class SimpleAIEngine:
    """Rule-based KPI and delay prediction helper."""

    def __init__(self) -> None:
        self.latest_kpis: Dict[str, Any] = {}

    # ------------------------------------------------------------------ KPI logic
    def calculate_kpis(
        self,
        points: List[Dict[str, Any]],
        dataset: Dict[str, Any],
        disruptions: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Compute KPIs from simulated points and active disruptions.

        Args:
            points: Flattened time–distance points for all trains.
            dataset: Loaded dataset dictionary.
            disruptions: Optional active disruption list.

        Returns:
            KPI dictionary with per-train and per-block metrics.
        """
        disruptions = disruptions or []
        timetable = dataset.get("timetable", [])

        kpi_per_train: Dict[str, Any] = {}
        kpi_per_block: Dict[str, Any] = {}
        signal_waits: Dict[str, float] = {}

        points_by_train: Dict[str, List[Dict[str, Any]]] = {}
        for p in points:
            points_by_train.setdefault(p["train_id"], []).append(p)

        timetable_by_train: Dict[str, List[Dict[str, Any]]] = {}
        for row in timetable:
            timetable_by_train.setdefault(row["train_id"], []).append(row)

        for rows in timetable_by_train.values():
            rows.sort(key=lambda r: self._time_to_minutes(r.get("arrival") or r.get("departure") or "00:00"))

        # Per-train KPIs
        for train_id, t_points in points_by_train.items():
            ordered = sorted(t_points, key=lambda p: self._time_to_minutes(p["time"]))
            if not ordered:
                continue
            start_time = ordered[0]["time"]
            end_time = ordered[-1]["time"]
            runtime_min = max(self._time_to_minutes(end_time) - self._time_to_minutes(start_time), 1)
            max_distance = max(p.get("distance_km", 0.0) for p in ordered)

            avg_speed = max_distance / (runtime_min / 60.0)
            schedule_rows = timetable_by_train.get(train_id, [])
            planned_end = schedule_rows[-1]["arrival"] if schedule_rows else None
            delay = 0.0
            if planned_end:
                delay = self._time_to_minutes(end_time) - self._time_to_minutes(planned_end)

            kpi_per_train[train_id] = {
                "average_speed_kmph": round(avg_speed, 2),
                "runtime_min": round(runtime_min, 1),
                "distance_km": round(max_distance, 2),
                "on_time_performance_min": round(delay, 1),
            }

        # Delay per block and signal waits from disruptions
        for d in disruptions:
            if d.get("type") == "delay_km":
                blk = d.get("block_id")
                kpi_per_block.setdefault(blk, 0.0)
                kpi_per_block[blk] += float(d.get("minutes", 0.0) or 0.0)
            if d.get("type") == "signal_stop":
                sig = d.get("signal_id")
                signal_waits.setdefault(sig, 0.0)
                signal_waits[sig] += float(d.get("minutes", 0.0) or 0.0)

        predictions = self.predict_delays(disruptions, dataset.get("blocks", []))

        self.latest_kpis = {
            "per_train": kpi_per_train,
            "per_block_delay_min": kpi_per_block,
            "signal_wait_times_min": signal_waits,
            "predictions": predictions,
        }
        return self.latest_kpis

    # ------------------------------------------------------------------ prediction
    def predict_delays(self, disruptions: List[Dict[str, Any]], blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Simple rule-based delay prediction.

        - Speed restriction: extra minutes = length * (1/v_new - 1/v_base)
        - Delay or signal stop: propagate to downstream blocks with small decay
        """
        block_map = {b["block_id"]: b for b in blocks}
        predictions: List[Dict[str, Any]] = []

        for d in disruptions:
            b_id = d.get("block_id")
            if not b_id or b_id not in block_map:
                continue

            block = block_map[b_id]
            length = float(block.get("length_km", 1.0))
            base_speed = float(block.get("max_speed_kmph", 80.0))

            if d.get("type") == "speed_restriction" and d.get("speed_kmph"):
                new_speed = float(d["speed_kmph"])
                extra_min = max(length / new_speed - length / base_speed, 0) * 60.0
                predictions.append(
                    {
                        "block_id": b_id,
                        "train_id": d.get("train_id"),
                        "predicted_delay_min": round(extra_min, 2),
                        "reason": "speed_restriction",
                    }
                )
            elif d.get("type") in {"delay_km", "signal_stop"}:
                extra = float(d.get("minutes", 0.0) or 0.0)
                predictions.append(
                    {
                        "block_id": b_id,
                        "train_id": d.get("train_id"),
                        "predicted_delay_min": round(extra, 2),
                        "reason": d.get("type"),
                    }
                )

        return predictions

    # ------------------------------------------------------------------ utilities
    @staticmethod
    def _time_to_minutes(time_str: str) -> int:
        """Convert HH:MM to minutes since midnight."""
        try:
            hh, mm = time_str.split(":")
            return int(hh) * 60 + int(mm)
        except Exception:
            return 0


# Singleton access helper
_ai_engine: Optional[SimpleAIEngine] = None


def get_ai_engine() -> SimpleAIEngine:
    """Return a singleton instance of the SimpleAIEngine."""
    global _ai_engine
    if _ai_engine is None:
        _ai_engine = SimpleAIEngine()
    return _ai_engine

