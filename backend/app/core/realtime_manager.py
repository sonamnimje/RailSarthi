# backend/app/core/realtime_manager.py
import asyncio
from typing import Dict, Any, Set, Optional
from fastapi import Depends
from datetime import datetime, timezone
import json
import uuid

# Import your simulator adapter
from app.services.adapter import build_simulator_from_inputs


# Run object that holds simulator instance + clients + loop task + last snapshot
class SimRun:
    def __init__(self, run_id: str, simulator):
        self.run_id = run_id
        self.simulator = simulator
        self.clients: Dict[str, Any] = {}  # client_id -> websocket
        self.task: Optional[asyncio.Task] = None
        self.running = False
        self.last_snapshot: Dict[str, Any] = {}
        self.lock = asyncio.Lock()

    async def broadcast(self, payload: dict):
        """Send payload to all connected clients"""
        dead = []
        async with self.lock:
            for cid, ws in list(self.clients.items()):
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.append(cid)
            for cid in dead:
                self.clients.pop(cid, None)


class RealtimeManager:
    def __init__(self):
        self.runs: Dict[str, SimRun] = {}
        self.tick_rate = 1.0

    async def create_run(self, run_id: Optional[str] = None, sim_config: Optional[dict] = None, start_time: Optional[str] = None) -> SimRun:
        """Create a new simulation run"""
        if run_id is None:
            run_id = uuid.uuid4().hex[:8]
        
        # Build simulator instance using adapter
        simulator = build_simulator_from_inputs(sim_config=sim_config)
        
        # Start the simulator
        simulator.start(start_time=start_time)
        
        run = SimRun(run_id, simulator)
        self.runs[run_id] = run
        return run

    async def start_run(self, run_id: str):
        """Start a simulation run"""
        run = self.runs.get(run_id)
        if not run:
            raise KeyError("run not found")
        if run.running:
            return
        
        run.running = True
        # Start background task
        run.task = asyncio.create_task(self._run_loop(run))

    async def pause_run(self, run_id: str):
        """Pause a simulation run"""
        run = self.runs.get(run_id)
        if not run:
            raise KeyError("run not found")
        
        run.running = False
        if run.task:
            run.task.cancel()
            try:
                await run.task
            except asyncio.CancelledError:
                pass
            run.task = None

    async def stop_run(self, run_id: str):
        """Stop a simulation run"""
        await self.pause_run(run_id)
        # Keep snapshot, but optionally remove run
        # self.runs.pop(run_id, None)

    async def _run_loop(self, run: SimRun):
        """Background loop that advances simulation and broadcasts updates"""
        try:
            sim = run.simulator
            
            while run.running:
                # Advance simulator one tick (1 second)
                await sim.tick()
                
                # Build snapshot
                snapshot = build_snapshot(sim)
                run.last_snapshot = snapshot
                
                # Broadcast to all clients
                await run.broadcast({
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    **snapshot
                })
                
                await asyncio.sleep(self.tick_rate)
        except asyncio.CancelledError:
            pass
        except Exception as ex:
            # Store last error in snapshot
            run.last_snapshot = {"error": str(ex)}
            import logging
            logging.error(f"Error in simulation loop for {run.run_id}: {ex}", exc_info=True)
        finally:
            run.running = False

    async def register_client(self, run_id: str, websocket) -> str:
        """Register a WebSocket client for a run"""
        # Create run if not exists
        if run_id not in self.runs:
            await self.create_run(run_id)
        
        run = self.runs[run_id]
        client_id = uuid.uuid4().hex[:8]
        
        async with run.lock:
            run.clients[client_id] = websocket
        
        # Send initial snapshot
        try:
            snapshot = run.last_snapshot or build_snapshot(run.simulator)
            await websocket.send_json({
                "type": "initial",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **snapshot
            })
        except Exception:
            pass
        
        return client_id

    async def unregister_client(self, run_id: str, client_id: str):
        """Unregister a WebSocket client"""
        run = self.runs.get(run_id)
        if not run:
            return
        
        async with run.lock:
            run.clients.pop(client_id, None)

    def get_snapshot(self, run_id: str) -> Dict[str, Any]:
        """Get the last snapshot for a run"""
        run = self.runs.get(run_id)
        if not run:
            return {}
        
        if not run.last_snapshot:
            # Generate snapshot on demand
            run.last_snapshot = build_snapshot(run.simulator)
        
        return run.last_snapshot


def build_snapshot(sim) -> Dict[str, Any]:
    """Build a snapshot from simulator state"""
    if hasattr(sim, "get_state"):
        st = sim.get_state()
        # Ensure required keys are present
        return {
            "train_positions": st.get("train_positions", []),
            "conflicts": st.get("conflicts", []),
            "section_load": st.get("section_load", []),
        }
    else:
        # Fallback: attempt to read attributes
        return {
            "train_positions": getattr(sim, "train_positions", []),
            "conflicts": getattr(sim, "conflicts", []),
            "section_load": getattr(sim, "section_load", []),
        }


# FastAPI dependency provider
_manager: Optional[RealtimeManager] = None

def get_realtime_manager() -> RealtimeManager:
    """Get or create the singleton RealtimeManager instance"""
    global _manager
    if _manager is None:
        _manager = RealtimeManager()
    return _manager

