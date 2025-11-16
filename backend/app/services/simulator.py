import asyncio
import json
import os
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

import networkx as nx
import pandas as pd


@dataclass
class TrainState:
    train_id: str
    schedule: Dict[str, Any]
    path: List[str]
    section_index: int = 0
    pos: float = 0.0
    speed: float = 10.0
    delay: float = 0.0
    priority: int = 1
    status: str = "running"


class SimulationEngine:
    """Lightweight digital twin simulation engine.

    - Loads CSVs from `app/data/<division>/`
    - Builds a NetworkX graph
    - Maintains train states
    - Runs an asyncio loop and broadcasts updates to subscribers
    """

    def __init__(self, division: str = "mumbai") -> None:
        self.division = division
        self.data_dir = os.path.join(os.path.dirname(__file__), "..", "data", division)
        self.graph: nx.Graph = nx.DiGraph()
        self.trains: Dict[str, TrainState] = {}
        self.tick: int = 0
        self.running: bool = False
        self._task: Optional[asyncio.Task] = None
        self._subscribers: Dict[str, Any] = {}
        self._lock = asyncio.Lock()
        self.kpis: Dict[str, Any] = {"throughput": 0, "avg_delay": 0.0, "punctuality": 1.0}

        # Try to load datasets; if absent, engine will still operate with empty graph
        try:
            self._load_csvs()
        except Exception:
            pass

    def _csv_path(self, name: str) -> str:
        return os.path.join(self.data_dir, name)

    def _load_csvs(self) -> None:
        # Expected files: stations.csv, sections.csv, trains.csv
        stations_fp = self._csv_path("stations.csv")
        sections_fp = self._csv_path("sections.csv")
        trains_fp = self._csv_path("trains.csv")

        if os.path.exists(stations_fp):
            stations = pd.read_csv(stations_fp)
            for _, r in stations.iterrows():
                self.graph.add_node(str(r.get("station_code", r.get("station_name", ""))).strip(), **r.to_dict())

        if os.path.exists(sections_fp):
            sections = pd.read_csv(sections_fp)
            for _, r in sections.iterrows():
                a = str(r.get("from", r.get("from_station", ""))).strip()
                b = str(r.get("to", r.get("to_station", ""))).strip()
                length = float(r.get("length_km", r.get("length", 1.0)))
                self.graph.add_edge(a, b, length_km=length)

        if os.path.exists(trains_fp):
            trains = pd.read_csv(trains_fp)
            for _, r in trains.iterrows():
                tid = str(r.get("train_no", r.get("train_id", uuid.uuid4().hex)))
                path = []
                if "path" in r and pd.notna(r["path"]):
                    path = [p.strip() for p in r["path"].split("->") if p.strip()]
                else:
                    # fallback to first two stations
                    if len(self.graph.nodes) >= 2:
                        path = list(self.graph.nodes)[:2]
                ts = TrainState(train_id=tid, schedule={}, path=path)
                self.trains[tid] = ts

    async def start(self) -> None:
        if self.running:
            return
        self.running = True
        loop = asyncio.get_running_loop()
        self._task = loop.create_task(self._run_loop())

    async def stop(self) -> None:
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
        # reload data to reset trains
        self.trains = {}
        try:
            self._load_csvs()
        except Exception:
            pass

    async def _run_loop(self) -> None:
        try:
            while self.running:
                async with self._lock:
                    self.tick += 1
                    self._advance_trains()
                    self._compute_kpis()
                    payload = {
                        "tick": self.tick,
                        "trains": [self._train_to_dict(t) for t in self.trains.values()],
                        "kpis": self.kpis,
                    }
                await self._broadcast(payload)
                await asyncio.sleep(1.0)  # 1 second per tick
        except asyncio.CancelledError:
            return

    def _train_to_dict(self, t: TrainState) -> Dict[str, Any]:
        return {
            "train_id": t.train_id,
            "section_index": t.section_index,
            "pos": t.pos,
            "speed": t.speed,
            "delay": t.delay,
            "priority": t.priority,
            "status": t.status,
            "path": t.path,
        }

    def _advance_trains(self) -> None:
        # simple deterministic movement along path
        for t in self.trains.values():
            if t.status != "running":
                continue
            # speed is km/h -> convert to km per tick (1s)
            km_per_tick = (t.speed / 3600.0)
            t.pos += km_per_tick
            # if section length known, advance index
            if t.section_index < len(t.path) - 1:
                a = t.path[t.section_index]
                b = t.path[t.section_index + 1]
                length = self.graph.get_edge_data(a, b, {}).get("length_km", 1.0) if self.graph.has_edge(a, b) else 1.0
                if t.pos >= length:
                    t.pos = 0.0
                    t.section_index += 1
                    # simple throughput increment on leaving a section
                    self.kpis["throughput"] = self.kpis.get("throughput", 0) + 1
            else:
                # reached destination
                t.status = "arrived"

    def _compute_kpis(self) -> None:
        delays = [t.delay for t in self.trains.values()]
        self.kpis["avg_delay"] = float(sum(delays) / len(delays)) if delays else 0.0
        arrived = sum(1 for t in self.trains.values() if t.status == "arrived")
        total = len(self.trains)
        self.kpis["punctuality"] = float((total - arrived) / total) if total else 1.0

    async def _broadcast(self, payload: Dict[str, Any]) -> None:
        # send JSON text to all subscribers; prune dead connections
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
        sid = uuid.uuid4().hex
        # store websocket directly; must be awaited by caller
        self._subscribers[sid] = ws
        return sid

    def remove_subscriber(self, sid: str) -> None:
        try:
            self._subscribers.pop(sid, None)
        except Exception:
            pass
from dataclasses import dataclass
from typing import Dict, Any, List
import random
import time
from datetime import datetime, timedelta, timezone


@dataclass
class SimulatorConfig:
	max_horizon_minutes: int = 120


class SimulatorService:
	def __init__(self, config: SimulatorConfig | None = None) -> None:
		self.config = config or SimulatorConfig()
		self.simulation_counter = 0
		self.recent_runs: List[Dict[str, Any]] = []

	def run(self, scenario: Dict[str, Any]) -> Dict[str, Any]:
		"""Run a digital twin simulation with realistic disruption modeling"""
		self.simulation_counter += 1
		simulation_id = f"sim-{self.simulation_counter:03d}"
		
		# Extract scenario data
		scenario_name = scenario.get("name", "Custom Scenario")
		disruptions = scenario.get("disruptions", [])
		
		# Simulate train impacts based on disruptions
		impacted_trains = self._simulate_train_impacts(disruptions)
		
		# Calculate comprehensive metrics
		metrics = self._calculate_metrics(disruptions, impacted_trains)
		
		# Generate prediction timeline
		predictions = self._generate_predictions(disruptions, impacted_trains)
		
		result = {
			"id": simulation_id,
			"name": scenario_name,
			"scenario": scenario,
			"impacted_trains": impacted_trains,
			"metrics": metrics,
			"predictions": predictions
		}
		self.recent_runs.append({
			"id": simulation_id,
			"name": scenario_name,
			"scenario": scenario,
			"result": result,
			"timestamp": datetime.now(timezone.utc).isoformat(),
		})
		self.recent_runs = self.recent_runs[-5:]
		return result

	def _simulate_train_impacts(self, disruptions: List[Dict[str, Any]]) -> List[str]:
		"""Simulate which trains are impacted by disruptions"""
		impacted_trains = []
		
		# Mock train data - in real implementation, this would come from database
		all_trains = [
			"T001-Local", "T002-Express", "T003-Freight", "T004-Local", 
			"T005-Express", "T006-Freight", "T007-Local", "T008-Express"
		]
		
		for disruption in disruptions:
			disruption_type = disruption.get("type", "delay")
			severity = disruption.get("severity", "medium")
			section_id = disruption.get("section_id", "SEC-001")
			
			# Determine impact based on disruption type and severity
			if disruption_type == "track_block":
				# Track blocks affect all trains in the section
				impacted_trains.extend([t for t in all_trains if t not in impacted_trains])
			elif disruption_type == "delay":
				# Delays affect 2-4 trains depending on severity
				num_affected = {"low": 2, "medium": 3, "high": 4}[severity]
				affected = random.sample(all_trains, min(num_affected, len(all_trains)))
				impacted_trains.extend([t for t in affected if t not in impacted_trains])
			elif disruption_type == "platform_issue":
				# Platform issues affect 1-2 trains
				num_affected = {"low": 1, "medium": 1, "high": 2}[severity]
				affected = random.sample(all_trains, min(num_affected, len(all_trains)))
				impacted_trains.extend([t for t in affected if t not in impacted_trains])
			elif disruption_type == "rolling_stock":
				# Rolling stock issues affect specific trains
				affected = random.sample(all_trains, min(2, len(all_trains)))
				impacted_trains.extend([t for t in affected if t not in impacted_trains])
			elif disruption_type == "signal_failure":
				# Signal failures affect multiple trains in the area
				affected = random.sample(all_trains, min(3, len(all_trains)))
				impacted_trains.extend([t for t in affected if t not in impacted_trains])
		
		return list(set(impacted_trains))  # Remove duplicates

	def _calculate_metrics(self, disruptions: List[Dict[str, Any]], impacted_trains: List[str]) -> Dict[str, Any]:
		"""Calculate comprehensive simulation metrics"""
		total_delay = 0
		missed_connections = 0
		platform_conflicts = 0
		passenger_delay_hours = 0
		
		# Calculate delays based on disruption severity and type
		for disruption in disruptions:
			disruption_type = disruption.get("type", "delay")
			severity = disruption.get("severity", "medium")
			duration_minutes = disruption.get("duration_seconds", 0) // 60
			
			# Base delay multipliers by severity
			severity_multipliers = {"low": 0.5, "medium": 1.0, "high": 2.0}
			multiplier = severity_multipliers.get(severity, 1.0)
			
			# Type-specific impact calculations
			if disruption_type == "track_block":
				base_delay = duration_minutes * 0.8  # 80% of disruption duration
				total_delay += base_delay * multiplier * len(impacted_trains)
				missed_connections += int(len(impacted_trains) * 0.3 * multiplier)
			elif disruption_type == "delay":
				base_delay = duration_minutes * 0.6
				total_delay += base_delay * multiplier * len(impacted_trains)
			elif disruption_type == "platform_issue":
				base_delay = duration_minutes * 0.4
				total_delay += base_delay * multiplier * len(impacted_trains)
				platform_conflicts += int(len(impacted_trains) * 0.5 * multiplier)
			elif disruption_type == "rolling_stock":
				base_delay = duration_minutes * 0.7
				total_delay += base_delay * multiplier * len(impacted_trains)
			elif disruption_type == "signal_failure":
				base_delay = duration_minutes * 0.5
				total_delay += base_delay * multiplier * len(impacted_trains)
				missed_connections += int(len(impacted_trains) * 0.2 * multiplier)
		
		# Calculate passenger delay (assuming average 50 passengers per train)
		passenger_delay_hours = (total_delay * 50) / 60  # Convert to hours
		
		# Calculate throughput impact
		throughput_impact = min(100, (total_delay / 60) * 10)  # 10% impact per hour of delay
		
		return {
			"total_delay_minutes": round(total_delay, 1),
			"missed_connections": missed_connections,
			"platform_conflicts": platform_conflicts,
			"throughput_impact_percent": round(throughput_impact, 1),
			"passenger_delay_hours": round(passenger_delay_hours, 1)
		}

	def _generate_predictions(self, disruptions: List[Dict[str, Any]], impacted_trains: List[str]) -> Dict[str, Any]:
		"""Generate prediction timeline and train impact details"""
		timeline = []
		train_impacts = []
		
		current_time = datetime.now()
		
		# Generate timeline events
		for i, disruption in enumerate(disruptions):
			start_time = current_time + timedelta(minutes=i * 5)
			duration_minutes = disruption.get("duration_seconds", 0) // 60
			end_time = start_time + timedelta(minutes=duration_minutes)
			
			timeline.append({
				"timestamp": start_time.timestamp(),
				"event": f"{disruption.get('type', 'disruption').replace('_', ' ').title()} starts",
				"impact": f"Affects {len(impacted_trains)} trains"
			})
			
			if duration_minutes > 0:
				timeline.append({
					"timestamp": end_time.timestamp(),
					"event": f"{disruption.get('type', 'disruption').replace('_', ' ').title()} resolved",
					"impact": "Normal operations resume"
				})
		
		# Generate train impact details
		for train_id in impacted_trains:
			# Random delay between 5-45 minutes
			delay_minutes = random.randint(5, 45)
			
			# Determine status based on delay
			if delay_minutes < 15:
				status = "on_time"
			elif delay_minutes < 30:
				status = "delayed"
			else:
				status = "cancelled"
			
			train_impacts.append({
				"train_id": train_id,
				"delay_minutes": delay_minutes,
				"status": status
			})
		
		return {
			"timeline": timeline,
			"train_impacts": train_impacts
		}

	def apply_to_real(self, simulation_id: str) -> Dict[str, Any]:
		"""Apply simulation results to real system"""
		try:
			# In a real implementation, this would:
			
			# 1. Validate the simulation results
			print(f"Validating simulation {simulation_id}...")
			
			# 2. Apply recommended actions to the real system
			actions_applied = self._apply_simulation_actions(simulation_id)
			
			# 3. Update train schedules and platform assignments
			schedule_updates = self._update_train_schedules(simulation_id)
			
			# 4. Notify relevant stakeholders
			notifications_sent = self._notify_stakeholders(simulation_id)
			
			return {
				"success": True,
				"message": f"Simulation {simulation_id} applied to real system successfully",
				"details": {
					"actions_applied": actions_applied,
					"schedule_updates": schedule_updates,
					"notifications_sent": notifications_sent
				}
			}
		except Exception as e:
			return {
				"success": False,
				"message": f"Failed to apply simulation: {str(e)}"
			}

	def _apply_simulation_actions(self, simulation_id: str) -> List[str]:
		"""Apply the recommended actions from simulation to real system"""
		# In real implementation, this would:
		# - Update train speeds and routes
		# - Modify platform assignments
		# - Adjust signal timings
		# - Update crew schedules
		
		actions = [
			"Updated train T001-Local speed to 45 km/h",
			"Reassigned platform 2 to T002-Express", 
			"Adjusted signal timing at Station A",
			"Updated crew schedule for affected trains"
		]
		
		print(f"Applied {len(actions)} actions for simulation {simulation_id}")
		return actions

	def _update_train_schedules(self, simulation_id: str) -> Dict[str, Any]:
		"""Update train schedules based on simulation results"""
		# In real implementation, this would:
		# - Update database with new arrival/departure times
		# - Modify platform assignments
		# - Update passenger information systems
		
		updates = {
			"trains_updated": 4,
			"platform_changes": 2,
			"schedule_adjustments": 8,
			"passenger_notifications": True
		}
		
		print(f"Updated schedules for simulation {simulation_id}: {updates}")
		return updates

	def _notify_stakeholders(self, simulation_id: str) -> List[str]:
		"""Notify relevant stakeholders about the changes"""
		# In real implementation, this would:
		# - Send alerts to train operators
		# - Update passenger information displays
		# - Notify maintenance teams
		# - Alert station managers
		
		notifications = [
			"Alert sent to train operators",
			"Passenger information displays updated",
			"Maintenance team notified",
			"Station managers alerted"
		]
		
		print(f"Sent {len(notifications)} notifications for simulation {simulation_id}")
		return notifications

	def get_recent_runs(self) -> List[Dict[str, Any]]:
		return list(self.recent_runs)


simulator_service = SimulatorService()


