"""
Graph Builder for Railway Digital Twin Network.
Builds NetworkX-based graph representation of railway network with stations, sections, and attributes.
"""
import networkx as nx
import pandas as pd
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import logging
from dataclasses import dataclass

from app.services.division_loader import normalize_stations, normalize_sections
from app.services.dataset_loader import load_time_distance_json

logger = logging.getLogger(__name__)


@dataclass
class SectionAttributes:
    """Attributes for a railway section"""
    section_id: str
    from_station: str
    to_station: str
    distance_km: float
    tracks: int
    direction: str  # "up", "down", "bidirectional"
    max_speed_kmph: float
    electrified: bool
    line_type: str  # "main", "loop", "siding"
    effective_speed_kmph: float
    speed_restrictions: List[Dict[str, Any]]
    curves: List[Dict[str, Any]]
    bridges: List[Dict[str, Any]]
    gradients: List[Dict[str, Any]]


class RailwayGraphBuilder:
    """Builds and manages railway network graph"""
    
    def __init__(self, dataset: Dict[str, Any]):
        """Initialize with division dataset"""
        self.dataset = dataset
        self.graph = nx.DiGraph()
        self.stations: Dict[str, Dict[str, Any]] = {}
        self.sections: Dict[str, SectionAttributes] = {}
        self.station_to_sections: Dict[str, List[str]] = {}  # station_code -> [section_ids]
        
    def build(self) -> nx.DiGraph:
        """Build the complete railway network graph"""
        logger.info("Building railway network graph...")
        
        # Build stations
        self._build_stations()
        
        # Build sections and edges
        self._build_sections()
        
        # Apply speed restrictions
        self._apply_speed_restrictions()
        
        # Apply curves and gradients
        self._apply_curves_gradients()
        
        # Apply bridges
        self._apply_bridges()
        
        logger.info(f"Graph built: {len(self.stations)} stations, {len(self.sections)} sections, {len(self.graph.edges)} edges")
        return self.graph
    
    def _build_stations(self):
        """Build station nodes"""
        stations_df = self.dataset.get("stations")
        if stations_df is None or stations_df.empty:
            logger.warning("No stations data found")
            return
        
        stations_list = normalize_stations(stations_df)
        for station in stations_list:
            code = station["code"]
            if not code:
                continue
            
            self.stations[code] = station
            
            # Add node to graph with all attributes
            self.graph.add_node(
                code,
                **station,
                node_type="station"
            )
            
            # Initialize station-to-sections mapping
            self.station_to_sections[code] = []
        
        logger.info(f"Built {len(self.stations)} station nodes")
    
    def _build_sections(self):
        """Build section edges"""
        sections_df = self.dataset.get("sections")
        if sections_df is None or sections_df.empty:
            logger.warning("No sections data found")
            return
        
        sections_list = normalize_sections(sections_df)
        sections_skipped = 0
        
        for section in sections_list:
            section_id = section["section_id"]
            from_station = section["from_station"]
            to_station = section["to_station"]
            
            # Validate stations exist
            if from_station not in self.stations or to_station not in self.stations:
                logger.warning(f"Skipping section {section_id}: station not found (from={from_station}, to={to_station})")
                sections_skipped += 1
                continue
            
            # Determine direction based on tracks
            tracks = section.get("tracks", 1)
            if tracks >= 2:
                direction = "bidirectional"
            else:
                direction = "down"  # Default to down direction for single track
            
            # Create section attributes
            section_attrs = SectionAttributes(
                section_id=section_id,
                from_station=from_station,
                to_station=to_station,
                distance_km=section.get("distance_km", 0.0),
                tracks=tracks,
                direction=direction,
                max_speed_kmph=section.get("max_speed_kmph", 100.0),
                electrified=section.get("electrified", False),
                line_type=section.get("line_type", "main"),
                effective_speed_kmph=section.get("max_speed_kmph", 100.0),
                speed_restrictions=[],
                curves=[],
                bridges=[],
                gradients=[]
            )
            
            self.sections[section_id] = section_attrs
            
            # Update station-to-sections mapping
            self.station_to_sections[from_station].append(section_id)
            self.station_to_sections[to_station].append(section_id)
            
            # Add edge(s) to graph
            # Create edge attributes dict, ensuring section_id is included
            edge_attrs = dict(section)
            edge_attrs['section_id'] = section_id
            edge_attrs['from_station'] = from_station
            edge_attrs['to_station'] = to_station
            
            if direction == "bidirectional" or tracks >= 2:
                # Double track - add both directions
                self.graph.add_edge(
                    from_station,
                    to_station,
                    **edge_attrs,
                    direction="down"
                )
                self.graph.add_edge(
                    to_station,
                    from_station,
                    **edge_attrs,
                    direction="up",
                    reverse=True
                )
            else:
                # Single track - directional
                self.graph.add_edge(
                    from_station,
                    to_station,
                    **edge_attrs,
                    direction=direction
                )
        
        if sections_skipped > 0:
            logger.warning(f"Skipped {sections_skipped} sections due to missing stations")
        
        logger.info(f"Built {len(self.sections)} sections")
    
    def _apply_speed_restrictions(self):
        """Apply speed restrictions to sections"""
        restrictions_df = self.dataset.get("speed_restrictions", None)
        if restrictions_df is None or restrictions_df.empty:
            return
        
        for _, row in restrictions_df.iterrows():
            section_id = str(row.get("section_id", "")).strip()
            if section_id not in self.sections:
                continue
            
            restriction_kmph = float(row.get("restriction_kmph", 0.0)) if pd.notna(row.get("restriction_kmph")) else 0.0
            reason = str(row.get("reason", "")) if pd.notna(row.get("reason")) else ""
            
            section_attrs = self.sections[section_id]
            section_attrs.speed_restrictions.append({
                "restriction_kmph": restriction_kmph,
                "reason": reason
            })
            
            # Update effective speed
            if restriction_kmph > 0:
                section_attrs.effective_speed_kmph = min(
                    section_attrs.effective_speed_kmph,
                    restriction_kmph
                )
        
        logger.info("Applied speed restrictions")
    
    def _apply_curves_gradients(self):
        """Apply curves and gradients to sections"""
        curves_df = self.dataset.get("curves", None)
        if curves_df is None or curves_df.empty:
            return
        
        for _, row in curves_df.iterrows():
            section_id = str(row.get("section_id", "")).strip()
            if section_id not in self.sections:
                continue
            
            section_attrs = self.sections[section_id]
            
            # Extract curve data
            radius_m = float(row.get("radius_m", 0.0)) if pd.notna(row.get("radius_m")) else 0.0
            gradient_per_mille = float(row.get("gradient_per_mille", 0.0)) if pd.notna(row.get("gradient_per_mille")) else 0.0
            
            curve_data = {
                "radius_m": radius_m,
                "gradient_per_mille": gradient_per_mille
            }
            
            section_attrs.curves.append(curve_data)
            section_attrs.gradients.append(curve_data)
            
            # Apply speed reduction for sharp curves
            if radius_m > 0 and radius_m < 500:  # Sharp curve
                # Reduce speed based on curve radius
                curve_speed = max(30.0, section_attrs.effective_speed_kmph * (radius_m / 500.0))
                section_attrs.effective_speed_kmph = min(
                    section_attrs.effective_speed_kmph,
                    curve_speed
                )
            
            # Apply speed reduction for steep gradients
            if abs(gradient_per_mille) > 10:  # Steep gradient (>1%)
                gradient_factor = 1.0 - (abs(gradient_per_mille) / 100.0)
                section_attrs.effective_speed_kmph *= max(0.7, gradient_factor)
        
        logger.info("Applied curves and gradients")
    
    def _apply_bridges(self):
        """Apply bridge restrictions to sections"""
        bridges_df = self.dataset.get("bridges", None)
        if bridges_df is None or bridges_df.empty:
            return
        
        for _, row in bridges_df.iterrows():
            section_id = str(row.get("sectionId", row.get("section_id", ""))).strip()
            if section_id not in self.sections:
                continue
            
            section_attrs = self.sections[section_id]
            
            bridge_type = str(row.get("type", "")).strip().lower()
            length_m = float(row.get("length_m", 0.0)) if pd.notna(row.get("length_m")) else 0.0
            condition = str(row.get("condition", "")).strip().lower()
            
            bridge_data = {
                "type": bridge_type,
                "length_m": length_m,
                "condition": condition
            }
            
            section_attrs.bridges.append(bridge_data)
            
            # Apply speed restriction for major bridges in poor condition
            if bridge_type == "major" and condition in ["poor", "fair"]:
                section_attrs.effective_speed_kmph *= 0.8
        
        logger.info("Applied bridge restrictions")
    
    def get_section(self, section_id: str) -> Optional[SectionAttributes]:
        """Get section attributes by ID"""
        return self.sections.get(section_id)
    
    def get_station(self, station_code: str) -> Optional[Dict[str, Any]]:
        """Get station data by code"""
        return self.stations.get(station_code)
    
    def find_section(self, from_station: str, to_station: str) -> Optional[str]:
        """Find section ID connecting two stations"""
        for section_id, section in self.sections.items():
            if (section.from_station == from_station and 
                section.to_station == to_station):
                return section_id
        return None
    
    def get_sections_from_station(self, station_code: str) -> List[str]:
        """Get all section IDs connected to a station"""
        return self.station_to_sections.get(station_code, [])
    
    def get_route_sections(self, route: List[str]) -> List[str]:
        """Get section IDs for a train route"""
        sections = []
        for i in range(len(route) - 1):
            from_station = route[i]
            to_station = route[i + 1]
            section_id = self.find_section(from_station, to_station)
            if section_id:
                sections.append(section_id)
        return sections
    
    def get_network_stats(self) -> Dict[str, Any]:
        """Get network statistics"""
        return {
            "stations": len(self.stations),
            "sections": len(self.sections),
            "edges": len(self.graph.edges),
            "nodes": len(self.graph.nodes),
            "is_connected": nx.is_strongly_connected(self.graph) if len(self.graph.nodes) > 0 else False
        }


# -----------------------------------------------------------------------------
# Time-distance graph builder (Jabalpur → Itarsi)
# -----------------------------------------------------------------------------

@dataclass
class Disruption:
    """Represents a simulated disruption event."""
    type: str
    block_id: Optional[str] = None
    train_id: Optional[str] = None
    signal_id: Optional[str] = None
    minutes: float = 0.0
    speed_kmph: Optional[float] = None
    km_offset: Optional[float] = None
    reason: Optional[str] = None


class TimeDistanceGraphBuilder:
    """
    Builds a time–distance graph for the Jabalpur → Itarsi section.

    The builder consumes JSON datasets (stations, blocks, signals, trains, timetable)
    and produces a list of timeline points that the frontend can plot directly.
    """

    def __init__(self, dataset: Optional[Dict[str, Any]] = None) -> None:
        self.dataset = dataset or load_time_distance_json()
        self.stations: Dict[str, Dict[str, Any]] = {
            s["code"]: s for s in self.dataset.get("stations", [])
        }
        # Preserve physical order either via 'order' or km marker
        self.station_order: List[Dict[str, Any]] = sorted(
            self.stations.values(),
            key=lambda s: (s.get("order", 0), s.get("km_marker", 0.0)),
        )
        self.blocks: Dict[str, Dict[str, Any]] = {
            b["block_id"]: b for b in self.dataset.get("blocks", [])
        }
        self.block_by_pair: Dict[Tuple[str, str], Dict[str, Any]] = {
            (b["start_station"], b["end_station"]): b for b in self.dataset.get("blocks", [])
        }
        self.signals_by_block: Dict[str, List[Dict[str, Any]]] = {}
        for sig in self.dataset.get("signals", []):
            self.signals_by_block.setdefault(sig["block_id"], []).append(sig)
        for sig_list in self.signals_by_block.values():
            sig_list.sort(key=lambda s: s.get("km_offset", 0.0))

        self.timetable_by_train: Dict[str, List[Dict[str, Any]]] = {}
        for row in self.dataset.get("timetable", []):
            self.timetable_by_train.setdefault(row["train_id"], []).append(row)
        for rows in self.timetable_by_train.values():
            rows.sort(key=lambda r: self._time_to_minutes(r.get("departure") or r.get("arrival") or "00:00"))

    def build(self, disruptions: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Build the full time–distance graph across all trains.

        Args:
            disruptions: Optional list of disruption dictionaries.

        Returns:
            Dict containing points and metadata for plotting.
        """
        disruption_objs = [self._normalize_disruption(d) for d in (disruptions or [])]
        points: List[Dict[str, Any]] = []
        train_summaries: List[Dict[str, Any]] = []

        for train in self.dataset.get("trains", []):
            train_id = train.get("train_id")
            schedule = self.timetable_by_train.get(train_id, [])
            if not train_id or not schedule:
                continue

            train_points, summary = self._simulate_train(train, schedule, disruption_objs)
            points.extend(train_points)
            train_summaries.append(summary)

        # Sort points by time for clean plotting
        points.sort(key=lambda p: (p["time"], p["train_id"]))

        return {
            "points": points,
            "stations": self.station_order,
            "blocks": list(self.blocks.values()),
            "trains": train_summaries,
        }

    # ------------------------------------------------------------------ helpers
    def _simulate_train(
        self,
        train: Dict[str, Any],
        schedule: List[Dict[str, Any]],
        disruptions: List[Disruption],
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """Simulate a single train and return plot points + summary."""
        points: List[Dict[str, Any]] = []
        train_id = train.get("train_id")
        max_speed = float(train.get("max_speed_kmph", 90.0))
        train_type = train.get("type", "Passenger")
        direction = train.get("direction", "up")

        # Seed with first departure time
        start_entry = schedule[0]
        current_time = self._parse_time(start_entry.get("departure") or "00:00")
        current_distance = self._station_distance(start_entry["station_code"])

        points.append(
            self._point(
                train_id,
                current_time,
                current_distance,
                station=start_entry["station_code"],
                event="departure",
                train_type=train_type,
                direction=direction,
            )
        )

        total_distance = 0.0
        total_run_minutes = 0.0
        total_delay_minutes = 0.0

        for idx in range(len(schedule) - 1):
            origin = schedule[idx]
            dest = schedule[idx + 1]
            block = self._find_block(origin["station_code"], dest["station_code"])
            if block is None:
                # Skip if no block defined between these stations
                continue

            segment_distance = float(block.get("length_km", 0.0))
            block_id = block.get("block_id")
            base_speed = min(max_speed, float(block.get("max_speed_kmph", max_speed)))

            # Apply dynamic speed reductions
            speed = base_speed
            for d in disruptions:
                if d.type == "speed_restriction" and d.block_id == block_id:
                    if d.speed_kmph:
                        speed = min(speed, d.speed_kmph)

            base_travel_min = (segment_distance / max(speed, 1e-6)) * 60.0

            # Add block-level delays
            block_delay = sum(
                d.minutes
                for d in disruptions
                if d.type == "delay_km"
                and d.block_id == block_id
                and (d.train_id is None or d.train_id == train_id)
            )

            # Signals within the block
            signal_delay_map = {
                d.signal_id: d.minutes
                for d in disruptions
                if d.type == "signal_stop"
                and d.block_id == block_id
                and (d.train_id is None or d.train_id == train_id)
            }

            segment_start_time = current_time + timedelta(minutes=block_delay)
            cumulative_signal_delay = 0.0

            for sig in self.signals_by_block.get(block_id, []):
                progress = min(max(sig.get("km_offset", 0.0) / segment_distance, 0.0), 1.0)
                signal_time = segment_start_time + timedelta(
                    minutes=base_travel_min * progress + cumulative_signal_delay
                )
                signal_distance = current_distance + sig.get("km_offset", 0.0)

                points.append(
                    self._point(
                        train_id,
                        signal_time,
                        signal_distance,
                        station=None,
                        signal_id=sig.get("signal_id"),
                        event="signal_pass",
                    )
                )

                if sig.get("signal_id") in signal_delay_map:
                    stop_min = signal_delay_map[sig["signal_id"]]
                    cumulative_signal_delay += stop_min
                    # Represent a stop at the same location
                    stop_time = signal_time + timedelta(minutes=stop_min)
                    points.append(
                        self._point(
                            train_id,
                            stop_time,
                            signal_distance,
                            station=None,
                            signal_id=sig.get("signal_id"),
                            event="signal_stop",
                        )
                    )

            arrival_time = segment_start_time + timedelta(
                minutes=base_travel_min + cumulative_signal_delay
            )
            arrival_distance = self._station_distance(dest["station_code"])

            dwell = float(dest.get("dwell_min") or 0.0)
            departure_time = (
                self._parse_time(dest["departure"])
                if dest.get("departure")
                else arrival_time + timedelta(minutes=dwell)
            )
            # If scheduled departure is earlier than computed arrival, respect actual
            departure_time = max(departure_time, arrival_time + timedelta(minutes=dwell))

            points.append(
                self._point(
                    train_id,
                    arrival_time,
                    arrival_distance,
                    station=dest["station_code"],
                    event="arrival",
                    train_type=train_type,
                    direction=direction,
                )
            )
            if dest.get("departure"):
                points.append(
                    self._point(
                        train_id,
                        departure_time,
                        arrival_distance,
                        station=dest["station_code"],
                        event="departure",
                        train_type=train_type,
                        direction=direction,
                    )
                )

            total_distance += segment_distance
            total_run_minutes += base_travel_min + cumulative_signal_delay + block_delay + dwell
            total_delay_minutes += block_delay + cumulative_signal_delay

            current_time = departure_time
            current_distance = arrival_distance

        summary = {
            "train_id": train_id,
            "name": train.get("name"),
            "type": train_type,
            "direction": direction,
            "total_distance_km": round(total_distance, 2),
            "run_time_min": round(total_run_minutes, 2),
            "avg_speed_kmph": round(total_distance / (total_run_minutes / 60.0), 2) if total_run_minutes else 0.0,
            "delay_minutes": round(total_delay_minutes, 2),
        }
        return points, summary

    def _normalize_disruption(self, raw: Dict[str, Any]) -> Disruption:
        """Normalize incoming disruption dict to a Disruption dataclass."""
        return Disruption(
            type=raw.get("type", "delay_km"),
            block_id=raw.get("block_id"),
            train_id=raw.get("train_id"),
            signal_id=raw.get("signal_id"),
            minutes=float(raw.get("minutes", 0.0) or 0.0),
            speed_kmph=raw.get("speed_kmph"),
            km_offset=raw.get("km_offset"),
            reason=raw.get("reason"),
        )

    def _station_distance(self, code: str) -> float:
        """Return cumulative km marker for a station."""
        station = self.stations.get(code)
        if station:
            return float(station.get("km_marker", 0.0))
        # Fallback to sequential order if marker missing
        for idx, st in enumerate(self.station_order):
            if st.get("code") == code:
                return float(idx) * 5.0  # simple spacing fallback
        return 0.0

    def _find_block(self, start: str, end: str) -> Optional[Dict[str, Any]]:
        """Return block connecting two stations."""
        return self.block_by_pair.get((start, end))

    @staticmethod
    def _parse_time(time_str: str) -> datetime:
        """Parse HH:MM into a datetime anchored to today."""
        today = datetime.now().date()
        try:
            return datetime.strptime(time_str, "%H:%M").replace(year=today.year, month=today.month, day=today.day)
        except Exception:
            return datetime.combine(today, datetime.min.time())

    @staticmethod
    def _time_to_minutes(time_str: str) -> float:
        """Convert HH:MM to minutes since midnight."""
        try:
            hh, mm = time_str.split(":")
            return int(hh) * 60 + int(mm)
        except Exception:
            return 0.0

    @staticmethod
    def _format_time(dt_val: datetime) -> str:
        """Format datetime to HH:MM."""
        return dt_val.strftime("%H:%M")

    def _point(
        self,
        train_id: str,
        dt_val: datetime,
        distance: float,
        station: Optional[str],
        event: str,
        signal_id: Optional[str] = None,
        train_type: Optional[str] = None,
        direction: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a standardized point for plotting."""
        return {
            "train_id": train_id,
            "time": self._format_time(dt_val),
            "distance_km": round(distance, 2),
            "station": station,
            "signal_id": signal_id,
            "event": event,
            "type": train_type,
            "direction": direction,
        }

