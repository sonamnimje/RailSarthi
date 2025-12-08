# backend/app/core/realtime_manager.py

import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import uuid
import logging

from app.services.adapter import build_simulator_from_inputs
from app.services.division_loader import load_division_dataset, normalize_stations
from app.services.live_train_service import LiveTrainService
from app.services.dataset_loader import load_time_distance_json
from app.core.graph_builder import TimeDistanceGraphBuilder
from app.core.ai_engine import get_ai_engine

logger = logging.getLogger(__name__)


# ============================================================
# SIM RUN CLASS
# ============================================================

class SimRun:
    def __init__(self, run_id: str, simulator):
        self.run_id = run_id
        self.simulator = simulator
        self.clients: Dict[str, Any] = {}
        self.task: Optional[asyncio.Task] = None
        self.running = False
        self.last_snapshot: Dict[str, Any] = {}
        self.lock = asyncio.Lock()

    async def broadcast(self, payload: dict):
        dead = []
        async with self.lock:
            for cid, ws in list(self.clients.items()):
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.append(cid)

            for cid in dead:
                self.clients.pop(cid, None)


# ============================================================
# REALTIME MANAGER
# ============================================================

class RealtimeManager:
    def __init__(self):
        self.runs: Dict[str, SimRun] = {}
        self.tick_rate = 1.0  # 1-second ticks

    async def create_run(self, run_id: Optional[str] = None, sim_config: Optional[dict] = None, start_time: Optional[str] = None) -> SimRun:
        if run_id is None:
            run_id = uuid.uuid4().hex[:8]
        
        simulator = build_simulator_from_inputs(sim_config=sim_config)
        simulator.start(start_time=start_time)
        
        run = SimRun(run_id, simulator)
        self.runs[run_id] = run
        return run

    async def start_run(self, run_id: str):
        run = self.runs.get(run_id)
        if not run:
            raise KeyError("Run not found")

        if run.running:
            return
        
        run.running = True
        run.task = asyncio.create_task(self._run_loop(run))

    async def pause_run(self, run_id: str):
        run = self.runs.get(run_id)
        if not run:
            raise KeyError("Run not found")
        
        run.running = False
        if run.task:
            run.task.cancel()
            try:
                await run.task
            except asyncio.CancelledError:
                pass
            run.task = None

    async def stop_run(self, run_id: str):
        await self.pause_run(run_id)

    async def _run_loop(self, run: SimRun):
        try:
            sim = run.simulator
            
            while run.running:
                await sim.tick()
                
                snapshot = build_snapshot(sim)
                run.last_snapshot = snapshot
                
                await run.broadcast({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    **snapshot
                })
                
                await asyncio.sleep(self.tick_rate)

        except asyncio.CancelledError:
            pass

        except Exception as ex:
            run.last_snapshot = {"error": str(ex)}
            logger.error(f"Error in simulation loop ({run.run_id}): {ex}", exc_info=True)

        finally:
            run.running = False

    async def register_client(self, run_id: str, websocket) -> str:
        if run_id not in self.runs:
            await self.create_run(run_id)
        
        run = self.runs[run_id]
        client_id = uuid.uuid4().hex[:8]
        
        async with run.lock:
            run.clients[client_id] = websocket
        
        try:
            snapshot = run.last_snapshot or build_snapshot(run.simulator)
            await websocket.send_json({
                "type": "initial",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **snapshot
            })
        except:
            pass
        
        return client_id

    async def unregister_client(self, run_id: str, client_id: str):
        run = self.runs.get(run_id)
        if not run:
            return
        async with run.lock:
            run.clients.pop(client_id, None)

    def get_snapshot(self, run_id: str) -> Dict[str, Any]:
        run = self.runs.get(run_id)
        if not run:
            return {}
        if not run.last_snapshot:
            run.last_snapshot = build_snapshot(run.simulator)
        return run.last_snapshot


# ============================================================
# BUILD SNAPSHOT
# ============================================================

def build_snapshot(sim) -> Dict[str, Any]:
    if hasattr(sim, "get_state"):
        st = sim.get_state()
        return {
            "train_positions": st.get("train_positions", []),
            "conflicts": st.get("conflicts", []),
            "section_load": st.get("section_load", []),
        }
    return {
        "train_positions": getattr(sim, "train_positions", []),
        "conflicts": getattr(sim, "conflicts", []),
        "section_load": getattr(sim, "section_load", []),
    }


# ============================================================
# SINGLETON MANAGER
# ============================================================

_manager: Optional[RealtimeManager] = None

def get_realtime_manager() -> RealtimeManager:
    global _manager
    if _manager is None:
        _manager = RealtimeManager()
    return _manager


# ============================================================
# LIVE DATA FETCHING
# ============================================================

DIVISION_HUB_STATIONS = {
    "mumbai": "MMCT",
    "pune": "PUNE",
    "nagpur": "NGP",
    "solapur": "SUR",
    "bhusaval": "BSL"
}


async def fetch_live_positions(division: str = "mumbai") -> List[Dict[str, Any]]:
    try:
        hub = DIVISION_HUB_STATIONS.get(division.lower(), "MMCT")
        service = LiveTrainService()

        # FIXED SIGNATURE → Only (station, hours)
        live_data = await service.get_live_station(hub, hours=2)

        if not live_data:
            return []
        
        trains_raw = live_data.get("data", live_data)

        if not isinstance(trains_raw, list):
            return []
        
        trains = []
        for t in trains_raw:
            try:
                train_no = str(t.get("trainNumber", t.get("trainNo", ""))).strip()
                if not train_no:
                    continue
                
                current = t.get("currentStatus", {})
                next_s = t.get("nextStatus", {})
                
                current_station = current.get("stationCode", "")
                next_station = next_s.get("stationCode", "")
                
                delay = int(t.get("delay", 0))
                status = "DELAYED" if delay > 0 else "RUNNING"
                
                trains.append({
                    "trainNo": train_no,
                    "trainName": t.get("trainName", ""),
                    "current_station": current_station,
                    "next_station": next_station,
                    "delay": delay,
                    "status": status,
                })
            except:
                continue
        
        return trains

    except Exception as e:
        logger.error(f"Live fetch failed: {e}")
        return []


# ============================================================
# MAP TRAINS TO COORDINATES
# ============================================================

def map_live_positions(live_data: List[Dict[str, Any]], division: str = "mumbai") -> List[Dict[str, Any]]:
    try:
        dataset = load_division_dataset(division)
        stations_df = dataset.get("stations")
        sections_df = dataset.get("sections")
        
        if stations_df is None or stations_df.empty:
            return []
        if sections_df is None or sections_df.empty:
            return []
        
        stations_list = normalize_stations(stations_df)
        station_map = {s["code"]: s for s in stations_list}
        
        sections_list = sections_df.to_dict("records")
        
        mapped = []

        for t in live_data:
            try:
                train_no = t["trainNo"]
                cs = t["current_station"].upper()
                ns = t["next_station"].upper()
                
                section = None
                progress = 0.5
                
                for sec in sections_list:
                    if sec["from"].upper() == cs and sec["to"].upper() == ns:
                        section = sec
                        progress = 0.3
                        break
                
                # Fall back to station
                if not section:
                    if cs in station_map:
                        st = station_map[cs]
                        mapped.append({
                            "trainNo": train_no,
                            "trainName": t.get("trainName", ""),
                            "lat": st["lat"],
                            "lon": st["lon"],
                            "delay": t["delay"],
                            "status": t["status"],
                        })
                    continue
                
                # Interpolate between two stations
                f = station_map.get(section["from"].upper())
                to = station_map.get(section["to"].upper())
                
                if f and to:
                    lat = f["lat"] + (to["lat"] - f["lat"]) * progress
                    lon = f["lon"] + (to["lon"] - f["lon"]) * progress
                    
                    mapped.append({
                        "trainNo": train_no,
                        "trainName": t.get("trainName", ""),
                        "lat": lat,
                        "lon": lon,
                        "delay": t["delay"],
                        "status": t["status"],
                        "route": [section["from"], section["to"]],
                    })
                    
            except Exception as e:
                logger.warning(f"Mapping error: {e}")
                continue
        
        return mapped
        
    except Exception as e:
        logger.error(f"Mapping failed: {e}", exc_info=True)
        return []


# -----------------------------------------------------------------------------
# Time-distance realtime manager (Jabalpur → Itarsi)
# -----------------------------------------------------------------------------

class TimeDistanceRealtimeManager:
    """
    Lightweight realtime manager that keeps the latest simulation graph,
    disruptions, and KPIs for the Jabalpur → Itarsi time–distance view.
    """

    def __init__(self, dataset: Optional[Dict[str, Any]] = None) -> None:
        self.dataset = dataset or load_time_distance_json()
        self.disruptions: List[Dict[str, Any]] = []
        self.builder = TimeDistanceGraphBuilder(self.dataset)
        self.ai_engine = get_ai_engine()
        self.last_graph = self.builder.build()
        self.last_kpis = self.ai_engine.calculate_kpis(self.last_graph.get("points", []), self.dataset, self.disruptions)

    def refresh(self) -> Dict[str, Any]:
        """Rebuild the graph and KPIs using current disruptions."""
        self.builder = TimeDistanceGraphBuilder(self.dataset)
        self.last_graph = self.builder.build(self.disruptions)
        self.last_kpis = self.ai_engine.calculate_kpis(
            self.last_graph.get("points", []), self.dataset, self.disruptions
        )
        return self.last_graph

    def add_disruption(self, disruption: Dict[str, Any]) -> Dict[str, Any]:
        """Register a new disruption and rebuild."""
        self.disruptions.append(disruption)
        return self.refresh()

    def clear_disruptions(self) -> Dict[str, Any]:
        """Clear all disruptions and rebuild the baseline graph."""
        self.disruptions = []
        return self.refresh()

    def get_graph(self) -> Dict[str, Any]:
        """Return the latest graph, rebuilding if empty."""
        if not self.last_graph:
            return self.refresh()
        return self.last_graph

    def get_kpis(self) -> Dict[str, Any]:
        """Return the latest KPIs."""
        if not self.last_kpis:
            self.refresh()
        return self.last_kpis

    def get_positions(self, current_time: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Compute live positions for all trains by interpolating the latest graph
        at the provided time (defaults to now).
        """
        graph = self.get_graph()
        points = graph.get("points", [])
        now_minutes = self._time_to_minutes(current_time) if current_time else self._time_to_minutes_now()

        positions: List[Dict[str, Any]] = []
        by_train: Dict[str, List[Dict[str, Any]]] = {}
        for p in points:
            by_train.setdefault(p["train_id"], []).append(p)

        for train_id, t_points in by_train.items():
            ordered = sorted(t_points, key=lambda p: self._time_to_minutes(p["time"]))
            if not ordered:
                continue

            # Before start
            if now_minutes <= self._time_to_minutes(ordered[0]["time"]):
                p0 = ordered[0]
                positions.append(
                    {
                        "train_id": train_id,
                        "distance_km": p0["distance_km"],
                        "time": p0["time"],
                        "station": p0.get("station"),
                        "status": "not_departed",
                    }
                )
                continue

            # After end
            if now_minutes >= self._time_to_minutes(ordered[-1]["time"]):
                p1 = ordered[-1]
                positions.append(
                    {
                        "train_id": train_id,
                        "distance_km": p1["distance_km"],
                        "time": p1["time"],
                        "station": p1.get("station"),
                        "status": "arrived",
                    }
                )
                continue

            prev_pt = ordered[0]
            next_pt = ordered[-1]
            for i in range(1, len(ordered)):
                if self._time_to_minutes(ordered[i]["time"]) >= now_minutes:
                    prev_pt = ordered[i - 1]
                    next_pt = ordered[i]
                    break

            prev_t = self._time_to_minutes(prev_pt["time"])
            next_t = self._time_to_minutes(next_pt["time"])
            progress = 0.0
            if next_t > prev_t:
                progress = (now_minutes - prev_t) / (next_t - prev_t)

            distance = prev_pt["distance_km"] + progress * (next_pt["distance_km"] - prev_pt["distance_km"])

            positions.append(
                {
                    "train_id": train_id,
                    "distance_km": round(distance, 2),
                    "time": current_time or self._minutes_to_time(now_minutes),
                    "from_event": prev_pt.get("event"),
                    "to_event": next_pt.get("event"),
                    "status": "running",
                }
            )

        return positions

    @staticmethod
    def _time_to_minutes(time_str: str) -> int:
        try:
            hh, mm = time_str.split(":")
            return int(hh) * 60 + int(mm)
        except Exception:
            return 0

    @staticmethod
    def _minutes_to_time(minutes_val: int) -> str:
        hh = (minutes_val // 60) % 24
        mm = minutes_val % 60
        return f"{hh:02d}:{mm:02d}"

    @staticmethod
    def _time_to_minutes_now() -> int:
        now = datetime.now()
        return now.hour * 60 + now.minute


# Singleton accessor
_td_manager: Optional[TimeDistanceRealtimeManager] = None


def get_time_distance_manager() -> TimeDistanceRealtimeManager:
    """Return singleton for the time–distance realtime manager."""
    global _td_manager
    if _td_manager is None:
        _td_manager = TimeDistanceRealtimeManager()
    return _td_manager