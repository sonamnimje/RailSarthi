# backend/app/core/realtime_manager.py

import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import uuid
import logging

from app.services.adapter import build_simulator_from_inputs
from app.services.division_loader import load_division_dataset, normalize_stations
from app.services.live_train_service import LiveTrainService

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