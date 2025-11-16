"""Simple deterministic simulator producing timeline outputs per train.

This module exposes `simulator_service.run(scenario)` which returns a simulation
result containing per-train arrival/departure times for the planning horizon.

The simulator uses the existing `load_division_dataset` to get stations,
sections and trains. Disruptions in the scenario (section_id, start_ts,
duration_seconds, severity) are applied as extra delays to trains whose routes
traverse the affected section during the disruption window.
"""
from __future__ import annotations
import uuid
from dataclasses import dataclass
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta, timezone
import math
import asyncio

from app.services.division_loader import load_division_dataset


@dataclass
class TimelineEntry:
	station: str
	arrival_ts: float
	departure_ts: float
	delay_seconds: int = 0


class SimpleSimulator:
	def __init__(self):
		self.counter = 0

	def _build_section_lookup(self, sections_df) -> Dict[str, float]:
		# map (from,to) -> distance_km
		lookup: Dict[str, float] = {}
		if sections_df is None or sections_df.empty:
			return lookup
		for _, r in sections_df.iterrows():
			a = str(r.get("from_station") or r.get("from") or "").strip().upper()
			b = str(r.get("to_station") or r.get("to") or "").strip().upper()
			if not a or not b:
				continue
			dist = float(r.get("distance_km") or r.get("distance") or 1.0)
			lookup[f"{a}->{b}"] = max(0.001, dist)
		return lookup

	def run(self, scenario: Dict[str, Any]) -> Dict[str, Any]:
		"""Run a simulation scenario and return timelines.

		scenario keys:
		  - division: str (required)
		  - horizon_minutes: int (optional)
		  - disruptions: list of {section_id, start_ts, duration_seconds, severity}
		"""
		self.counter += 1
		sim_id = f"sim-{self.counter:04d}"

		division = str(scenario.get("division", "mumbai")).lower()
		horizon = int(scenario.get("horizon_minutes", 120))
		disruptions = scenario.get("disruptions", []) or []

		now = datetime.now(timezone.utc)

		dataset = load_division_dataset(division)
		stations_df = dataset.get("stations")
		sections_df = dataset.get("sections")
		trains_df = dataset.get("trains")

		section_lookup = self._build_section_lookup(sections_df)

		# Build train list using normalized trains function
		from app.services.division_loader import normalize_trains

		trains = normalize_trains(trains_df)

		results: Dict[str, List[Dict[str, Any]]] = {}
		total_delay = 0
		throughput = 0

		for t in trains:
			train_id = t.get("train_id")
			route = t.get("route", [])
			speed = float(t.get("max_speed_kmph", 60.0) or 60.0)
			dwell = int(t.get("dwell_seconds", 120)) if t.get("dwell_seconds") is not None else 120

			timeline: List[Dict[str, Any]] = []
			current_time = now

			# If train schedule has planned departure, try to use it (simple heuristics)
			sched = t.get("schedule") or {}
			# If schedule contains 'departure_time' at first station as ISO, use it
			dep0 = None
			if isinstance(sched, dict):
				dep0 = sched.get("departure_time") or sched.get("start_time")
			if dep0:
				try:
					current_time = datetime.fromisoformat(dep0)
				except Exception:
					# leave as now
					current_time = now

			for i, station in enumerate(route):
				if i == 0:
					arrival = current_time
					departure = arrival + timedelta(seconds=dwell)
				else:
					prev = route[i - 1]
					sec_key = f"{prev}->{station}"
					dist = section_lookup.get(sec_key, 1.0)
					travel_seconds = int(math.ceil((dist / max(1.0, speed)) * 3600.0))
					arrival = current_time + timedelta(seconds=travel_seconds)

					# apply disruptions that cover this section and time
					add_delay = 0
					for d in disruptions:
						sec = d.get("section_id")
						# allow section_id either as a->b or matches from/to
						if not sec:
							continue
						if sec == sec_key or sec == f"{prev}->{station}" or sec == f"{station}->{prev}":
							start_ts = d.get("start_ts")
							dur = int(d.get("duration_seconds", 0))
							if start_ts:
								# compare timestamps
								try:
									start_dt = datetime.fromtimestamp(float(start_ts), tz=timezone.utc)
								except Exception:
									start_dt = now
								end_dt = start_dt + timedelta(seconds=dur)
								if start_dt <= arrival <= end_dt:
									severity = d.get("severity", "medium")
									if severity == "low":
										add_delay += 60
									elif severity == "medium":
										add_delay += 180
									else:
										add_delay += 600
							else:
								# if no timestamp, always apply
								sev = d.get("severity", "medium")
								add_delay += {"low": 60, "medium": 180, "high": 600}.get(sev, 180)

					if add_delay:
						arrival = arrival + timedelta(seconds=add_delay)

					departure = arrival + timedelta(seconds=dwell)
					current_time = departure

				timeline.append({
					"station": station,
					"arrival_ts": arrival.timestamp(),
					"departure_ts": departure.timestamp(),
					"delay_seconds": 0
				})

			# compute train-level metrics
			# simple: delay = sum of delays beyond scheduled (if schedule info present)
			results[train_id] = timeline
			throughput += len(route) - 1

		avg_delay = 0.0
		if results:
			# placeholder avg_delay (detailed calculation requires schedule comparison)
			avg_delay = 0.0

		sim_result = {
			"id": sim_id,
			"division": division,
			"timestamp": now.isoformat(),
			"horizon_minutes": horizon,
			"trains": results,
			"metrics": {
				"throughput": throughput,
				"avg_delay_seconds": avg_delay
			}
		}

		return sim_result


# Export a default simulator service instance for API modules to use
simulator_service = SimpleSimulator()


@dataclass
class SimulatorConfig:
	max_horizon_minutes: int = 120


class SimulatorService:
	"""Compatibility wrapper expected by older modules.

	Provides `run(scenario)`, `apply_to_real(sim_id)`, and `get_recent_runs()`.
	"""

	def __init__(self, config: Optional[SimulatorConfig] = None) -> None:
		self.config = config or SimulatorConfig()
		self._simple = simulator_service
		self._history: List[Dict[str, Any]] = []

	def run(self, scenario: Dict[str, Any]) -> Dict[str, Any]:
		# Ensure horizon respects config
		if "horizon_minutes" not in scenario:
			scenario["horizon_minutes"] = self.config.max_horizon_minutes
		res = self._simple.run(scenario)
		# store minimal history
		self._history.append({"id": res.get("id"), "timestamp": res.get("timestamp"), "result": res})
		self._history = self._history[-10:]
		return res

	def apply_to_real(self, simulation_id: str) -> Dict[str, Any]:
		# Placeholder: in real system this would apply changes to DB/OPS
		return {"success": True, "message": f"Simulation {simulation_id} applied (noop)"}

	def get_recent_runs(self) -> List[Dict[str, Any]]:
		return list(self._history)



class SimulationEngine:
	"""Compatibility wrapper providing an async simulation loop and websocket broadcasts.

	- Keeps `running`, `tick` counters
	- `start()` launches an asyncio background loop which calls `simulator_service.run()`
	  at 1-second ticks (configurable) and broadcasts the result to subscribers.
	- Provides `add_subscriber(ws) -> sid` and `remove_subscriber(sid)` to manage websockets.
	"""

	def __init__(self, division: str = "mumbai", tick_interval: float = 1.0) -> None:
		import asyncio

		self.division = division
		self.tick_interval = tick_interval
		self.running = False
		self.tick = 0
		self._task: Optional[asyncio.Task] = None
		self._subscribers: Dict[str, Any] = {}
		self._lock = asyncio.Lock()

	async def start(self) -> None:
		import asyncio

		if self.running:
			return
		self.running = True
		loop = asyncio.get_running_loop()
		self._task = loop.create_task(self._run_loop())

	async def stop(self) -> None:
		if not self.running:
			return
		self.running = False
		if self._task:
			self._task.cancel()
			try:
				await self._task
			except asyncio.CancelledError:
				pass
			self._task = None

	async def reset(self) -> None:
		await self.stop()
		self.tick = 0

	async def _run_loop(self) -> None:
		import asyncio

		try:
			while self.running:
				async with self._lock:
					self.tick += 1
					# run a short simulation for the division and broadcast
					try:
						payload = simulator_service.run({"division": self.division, "horizon_minutes": 60})
					except Exception as e:
						payload = {"error": str(e)}

				# broadcast outside lock
				await self._broadcast(payload)
				await asyncio.sleep(self.tick_interval)
		except asyncio.CancelledError:
			return

	async def _broadcast(self, payload: Dict[str, Any]) -> None:
		import json

		dead = []
		text = json.dumps(payload, default=str)
		for sid, ws in list(self._subscribers.items()):
			try:
				await ws.send_text(text)
			except Exception:
				dead.append(sid)
		for sid in dead:
			self._subscribers.pop(sid, None)

	def add_subscriber(self, ws) -> str:
		import uuid

		sid = uuid.uuid4().hex
		self._subscribers[sid] = ws
		return sid

	def remove_subscriber(self, sid: str) -> None:
		try:
			self._subscribers.pop(sid, None)
		except Exception:
			pass



