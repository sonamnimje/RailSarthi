"""
Graph Builder for Railway Digital Twin Network.
Builds NetworkX-based graph representation of railway network with stations, sections, and attributes.
"""
import networkx as nx
import pandas as pd
from typing import Dict, Any, List, Optional, Tuple
import logging
from dataclasses import dataclass

from app.services.division_loader import normalize_stations, normalize_sections

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

