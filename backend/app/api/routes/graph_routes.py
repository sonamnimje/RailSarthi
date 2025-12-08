from typing import Optional, Literal, List, Dict, Any
import asyncio
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from app.core.realtime_manager import get_time_distance_manager
from app.core.ai_engine import get_ai_engine


router = APIRouter(prefix="/api", tags=["time-distance"])


class DisruptionRequest(BaseModel):
	"""Request payload for injecting disruptions."""
	type: Literal["delay_km", "signal_stop", "speed_restriction"]
	block_id: Optional[str] = None
	train_id: Optional[str] = None
	signal_id: Optional[str] = None
	minutes: float = 0.0
	speed_kmph: Optional[float] = None
	km_offset: Optional[float] = None
	reason: Optional[str] = None


@router.get("/graph")
async def get_time_distance_graph() -> dict:
	"""Return the latest time–distance graph for all trains."""
	manager = get_time_distance_manager()
	return manager.get_graph()


def _time_to_minutes(time_str: str) -> int:
	"""Convert HH:MM string to minutes since 00:00."""
	try:
		hour, minute = time_str.split(":")
		return int(hour) * 60 + int(minute)
	except Exception as exc:  # pragma: no cover - defensive
		raise ValueError(f"Invalid time format '{time_str}'") from exc


@router.get("/time-distance/schedule")
def get_schedule_time_distance() -> Dict[str, Any]:
	"""
	Return timetable schedule parsed from CSV for the static time–distance chart.

	We prefer `trains.csv` (as requested by UI) when it already contains
	station-wise timings. If that file is missing the required columns, we
	fall back to `train_schedule.csv` so existing simulations keep working.
	"""
	data_dir = Path(__file__).resolve().parents[2] / "data"
	preferred = data_dir / "trains.csv"
	fallback = data_dir / "train_schedule.csv"
	required_cols = {"train_id", "station_name", "km_position", "scheduled_arrival", "scheduled_departure", "halt_minutes"}

	def _load_valid_df(path: Path) -> Optional[pd.DataFrame]:
		if not path.exists():
			return None
		df_local = pd.read_csv(path)
		if not required_cols.issubset(df_local.columns):
			return None
		return df_local

	preferred_df = _load_valid_df(preferred)
	fallback_df = _load_valid_df(fallback) if preferred_df is None else None
	df = preferred_df or fallback_df
	source_path = preferred if preferred_df is not None else fallback
	if df is None:
		raise HTTPException(status_code=400, detail=f"CSV missing columns. Expected {sorted(required_cols)}")

	df["arrival_min"] = df["scheduled_arrival"].astype(str).map(_time_to_minutes)
	df["departure_min"] = df["scheduled_departure"].astype(str).map(_time_to_minutes)
	df = df.sort_values(["train_id", "departure_min"])

	stations = (
		df[["station_name", "km_position"]]
		.drop_duplicates(subset=["station_name"])
		.sort_values("km_position")
		.to_dict(orient="records")
	)

	trains: List[Dict[str, Any]] = []
	for train_id, group in df.groupby("train_id"):
		stops = group.sort_values("departure_min").to_dict(orient="records")
		trains.append({"train_id": train_id, "stops": stops})

	meta = {
		"earliest_departure_min": int(df["departure_min"].min()),
		"latest_arrival_min": int(df["arrival_min"].max()),
		"station_count": len(stations),
		"train_count": len(trains),
		"source_file": source_path.name,
	}

	return {"stations": stations, "trains": trains, "meta": meta}


@router.get("/time-distance/jbp-itarsi")
def get_jbp_itarsi_schedule() -> Dict[str, Any]:
	"""
	Return Jabalpur→Itarsi timetable parsed from `jbp-itarsi.csv`.

	Columns: train_id, train_name, train_type, station, distance_km, scheduled_time, actual_time
	"""
	data_dir = Path(__file__).resolve().parents[2] / "data"
	data_path = data_dir / "jbp-itarsi.csv"
	if not data_path.exists():
		raise HTTPException(status_code=404, detail="jbp-itarsi.csv not found")

	df = pd.read_csv(data_path)
	required_cols = {
		"train_id",
		"train_name",
		"train_type",
		"station",
		"distance_km",
		"scheduled_time",
		"actual_time",
	}
	if not required_cols.issubset(df.columns):
		raise HTTPException(status_code=400, detail=f"CSV missing columns. Expected {sorted(required_cols)}")

	# Normalize numeric columns
	df["distance_km"] = pd.to_numeric(df["distance_km"], errors="coerce")
	df["scheduled_time"] = pd.to_numeric(df["scheduled_time"], errors="coerce")
	df["actual_time"] = pd.to_numeric(df["actual_time"], errors="coerce")
	if df[["distance_km", "scheduled_time", "actual_time"]].isnull().any().any():
		raise HTTPException(status_code=400, detail="CSV contains non-numeric distance or time values")

	df = df.sort_values(["train_id", "distance_km"])

	stations = (
		df[["station", "distance_km"]]
		.drop_duplicates(subset=["station"])
		.sort_values("distance_km")
		.rename(columns={"station": "station_name", "distance_km": "km_position"})
		.to_dict(orient="records")
	)

	trains: List[Dict[str, Any]] = []
	for train_id, group in df.groupby("train_id"):
		stops = group.to_dict(orient="records")
		trains.append(
			{
				"train_id": train_id,
				"train_name": group.iloc[0]["train_name"],
				"train_type": group.iloc[0]["train_type"],
				"stops": stops,
			}
		)

	meta = {
		"earliest_time_min": int(df["scheduled_time"].min()),
		"latest_time_min": int(df["actual_time"].max()),
		"station_count": len(stations),
		"train_count": len(trains),
		"source_file": data_path.name,
	}

	return {"stations": stations, "trains": trains, "meta": meta}


@router.get("/kpis")
async def get_kpis() -> dict:
	"""Return current KPIs."""
	manager = get_time_distance_manager()
	return manager.get_kpis()


@router.get("/disruptions")
async def list_disruptions() -> dict:
	"""List active disruptions."""
	manager = get_time_distance_manager()
	return {"disruptions": manager.disruptions}


@router.post("/disruptions")
async def add_disruption(disruption: DisruptionRequest) -> dict:
	"""
	Inject a disruption (delay, signal stop, or speed restriction) and rebuild the graph + KPIs.
	"""
	manager = get_time_distance_manager()
	graph = manager.add_disruption(disruption.model_dump())
	return {"graph": graph, "kpis": manager.get_kpis()}


@router.delete("/disruptions")
async def clear_disruptions() -> dict:
	"""Clear all disruptions and rebuild the baseline graph."""
	manager = get_time_distance_manager()
	graph = manager.clear_disruptions()
	return {"graph": graph, "kpis": manager.get_kpis()}


@router.get("/realtime")
async def realtime_positions(current_time: Optional[str] = None) -> dict:
	"""Return interpolated live positions for all trains."""
	manager = get_time_distance_manager()
	return {"positions": manager.get_positions(current_time), "kpis": manager.get_kpis()}


@router.websocket("/ws/time-distance")
async def time_distance_socket(ws: WebSocket) -> None:
	"""
	WebSocket streaming of train positions and KPIs for the time–distance graph.
	Clients receive a JSON frame every 2 seconds.
	"""
	await ws.accept()
	manager = get_time_distance_manager()
	try:
		while True:
			payload = {
				"type": "time_distance_frame",
				"positions": manager.get_positions(),
				"kpis": manager.get_kpis(),
				"graph": manager.get_graph(),
			}
			await ws.send_json(payload)
			await asyncio.sleep(2.0)
	except WebSocketDisconnect:
		return
	except Exception as exc:
		await ws.close(code=1011, reason=str(exc))

