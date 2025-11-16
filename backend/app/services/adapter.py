"""
Adapter that loads CSVs / inputs and builds an instance of SimulatorService
wrapped for real-time simulation use.
"""
import pandas as pd
import os
from typing import Optional, Dict, Any, List
from pathlib import Path
from datetime import datetime, timedelta, timezone
import random

# Import the existing simulator service
from app.services.simulator import SimulatorService, SimulatorConfig

# Adjust this path if your inputs are elsewhere
BASE_DIR = Path(__file__).resolve().parents[2]  # backend/app/services -> backend
INPUTS_DIR = BASE_DIR / "inputs"
if not INPUTS_DIR.exists():
    INPUTS_DIR = BASE_DIR / "app" / "inputs"


def _load_csv(name: str) -> pd.DataFrame:
    """Load a CSV file from inputs directory"""
    p = INPUTS_DIR / name
    if p.exists():
        return pd.read_csv(p)
    return pd.DataFrame()


class RealtimeSimulator:
    """
    Wrapper around SimulatorService that provides real-time simulation capabilities
    with tick-based advancement and state tracking.
    """
    
    def __init__(self, sim_config: Optional[Dict] = None):
        """Initialize the real-time simulator"""
        config = SimulatorConfig()
        if sim_config:
            if "max_horizon_minutes" in sim_config:
                config.max_horizon_minutes = sim_config["max_horizon_minutes"]
        
        self.simulator_service = SimulatorService(config)
        
        # Load input data
        self.stations_df = _load_csv("stations.csv")
        self.sections_df = _load_csv("sections.csv")
        self.trains_df = _load_csv("trains.csv")
        
        # Real-time simulation state
        self.current_time: datetime = datetime.now(timezone.utc)
        self.start_time: Optional[datetime] = None
        self.train_positions: List[Dict[str, Any]] = []
        self.conflicts: List[Dict[str, Any]] = []
        self.section_load: List[Dict[str, Any]] = []
        self.disruptions: List[Dict[str, Any]] = []
        self.overrides: List[Dict[str, Any]] = []
        self.is_running: bool = False
        
        # Initialize train positions from trains data
        self._initialize_train_positions()
    
    def _initialize_train_positions(self):
        """Initialize train positions from trains data"""
        if not self.trains_df.empty:
            for _, row in self.trains_df.iterrows():
                train_id = str(row.get("id", f"T{len(self.train_positions) + 1}"))
                self.train_positions.append({
                    "train_id": train_id,
                    "section": row.get("section", "UNKNOWN"),
                    "location_km": float(row.get("location_km", 0.0)),
                    "speed_kmph": float(row.get("speed_kmph", 60.0)),
                    "status": "running"
                })
        else:
            # Fallback: create some mock trains
            for i in range(5):
                self.train_positions.append({
                    "train_id": f"T{i+1:03d}",
                    "section": f"SECTION-{i+1}",
                    "location_km": float(i * 10),
                    "speed_kmph": 60.0,
                    "status": "running"
                })
    
    def start(self, start_time: Optional[str] = None):
        """Start the simulation"""
        if start_time:
            try:
                self.current_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            except Exception:
                self.current_time = datetime.now(timezone.utc)
        else:
            self.current_time = datetime.now(timezone.utc)
        
        self.start_time = self.current_time
        self.is_running = True
    
    async def tick(self):
        """Advance simulation by one second (1 tick)"""
        if not self.is_running:
            return
        
        # Advance time by 1 second
        self.current_time += timedelta(seconds=1)
        
        # Update train positions (simplified: move trains forward)
        for pos in self.train_positions:
            # Move train forward based on speed
            speed_mps = pos["speed_kmph"] / 3.6  # Convert km/h to m/s
            distance_m = speed_mps * 1.0  # Distance in 1 second
            pos["location_km"] += distance_m / 1000.0
            
            # Check for section boundaries (simplified)
            if pos["location_km"] > 50.0:  # Reset after 50km
                pos["location_km"] = 0.0
                # Move to next section
                section_num = int(pos["section"].split("-")[-1]) if "-" in pos["section"] else 1
                pos["section"] = f"SECTION-{(section_num % 5) + 1}"
        
        # Detect conflicts (simplified: check if trains are too close)
        self._detect_conflicts()
        
        # Update section load
        self._update_section_load()
    
    def _detect_conflicts(self):
        """Detect conflicts between trains"""
        self.conflicts = []
        
        # Group trains by section
        trains_by_section: Dict[str, List[Dict]] = {}
        for pos in self.train_positions:
            section = pos["section"]
            if section not in trains_by_section:
                trains_by_section[section] = []
            trains_by_section[section].append(pos)
        
        # Check for conflicts in each section
        for section, trains in trains_by_section.items():
            if len(trains) > 1:
                # Sort by location
                trains_sorted = sorted(trains, key=lambda x: x["location_km"])
                for i in range(len(trains_sorted) - 1):
                    train1 = trains_sorted[i]
                    train2 = trains_sorted[i + 1]
                    distance = train2["location_km"] - train1["location_km"]
                    
                    # Conflict if trains are within 2km of each other
                    if distance < 2.0:
                        self.conflicts.append({
                            "type": "proximity",
                            "section": section,
                            "train1": train1["train_id"],
                            "train2": train2["train_id"],
                            "distance_km": round(distance, 2),
                            "severity": "high" if distance < 0.5 else "medium"
                        })
    
    def _update_section_load(self):
        """Update section load metrics"""
        trains_by_section: Dict[str, int] = {}
        for pos in self.train_positions:
            section = pos["section"]
            trains_by_section[section] = trains_by_section.get(section, 0) + 1
        
        self.section_load = [
            {
                "section": section,
                "train_count": count,
                "load_percent": min(100, count * 20)  # Simplified: 20% per train, max 100%
            }
            for section, count in trains_by_section.items()
        ]
    
    def get_state(self) -> Dict[str, Any]:
        """Get current simulation state"""
        return {
            "train_positions": self.train_positions,
            "conflicts": self.conflicts,
            "section_load": self.section_load,
            "current_time": self.current_time.isoformat(),
            "elapsed_seconds": (self.current_time - self.start_time).total_seconds() if self.start_time else 0
        }
    
    async def inject_disruption(self, disruption: Dict[str, Any]):
        """Inject a disruption into the simulation"""
        disruption["injected_at"] = self.current_time.isoformat()
        self.disruptions.append(disruption)
        
        # Apply disruption effects (simplified)
        section_id = disruption.get("section_id", "")
        if section_id:
            for pos in self.train_positions:
                if pos["section"] == section_id:
                    # Reduce speed or stop train
                    if disruption.get("type") == "track_block":
                        pos["speed_kmph"] = 0.0
                        pos["status"] = "stopped"
                    elif disruption.get("type") == "delay":
                        pos["speed_kmph"] *= 0.5  # Reduce speed by 50%
    
    async def apply_override(self, train_id: str, section: str, enter_ts: str, leave_ts: str, reason: str):
        """Apply an override to a train"""
        override = {
            "train_id": train_id,
            "section": section,
            "enter_ts": enter_ts,
            "leave_ts": leave_ts,
            "reason": reason,
            "applied_at": self.current_time.isoformat()
        }
        self.overrides.append(override)
        
        # Apply override to train position
        for pos in self.train_positions:
            if pos["train_id"] == train_id:
                pos["section"] = section
                # Set position based on override timing
                try:
                    enter_time = datetime.fromisoformat(enter_ts.replace('Z', '+00:00'))
                    if self.current_time >= enter_time:
                        pos["status"] = "override_active"
                except Exception:
                    pass


def build_simulator_from_inputs(sim_config: Optional[Dict] = None) -> RealtimeSimulator:
    """
    Build a RealtimeSimulator instance from CSV inputs.
    
    Args:
        sim_config: Optional configuration dictionary
        
    Returns:
        RealtimeSimulator instance
    """
    return RealtimeSimulator(sim_config=sim_config)

