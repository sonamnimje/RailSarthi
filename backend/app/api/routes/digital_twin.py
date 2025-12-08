"""
Digital Twin API routes for map and position data.
"""
from fastapi import APIRouter, HTTPException, Path as PathParam
from pathlib import Path
from typing import Dict, Any, List
import logging
from datetime import datetime

from app.services.division_loader import load_division_dataset, normalize_stations, normalize_sections
import random
from collections import defaultdict, deque
import json
import pandas as pd
from pathlib import Path

logger = logging.getLogger(__name__)

router = APIRouter()


def _load_disruption_catalog() -> List[Dict[str, Any]]:
    """
    Load disruption catalog from railway_disruptions.csv.
    Returns list of disruption types with categories.
    """
    try:
        data_path = Path(__file__).resolve().parents[2] / "data" / "railway_disruptions.csv"
        if data_path.exists():
            df = pd.read_csv(data_path)
            return df.to_dict('records')
        return []
    except Exception as e:
        logger.warning(f"Failed to load disruption catalog: {e}")
        return []


def _map_disruption_type_to_system_type(disruption_name: str, category: str) -> str:
    """
    Map disruption name from catalog to system disruption type.
    Returns: signal_failure, track_block, weather_slowdown, rolling_stock, operational, etc.
    """
    disruption_lower = disruption_name.lower()
    category_lower = category.lower()
    
    # Signalling & Control System Failures
    if "signal" in disruption_lower or "signalling" in category_lower:
        if "signal failure" in disruption_lower or "red lamp" in disruption_lower or "aspect stuck" in disruption_lower:
            return "signal_failure"
        if "interlocking" in disruption_lower or "track circuit" in disruption_lower:
            return "signal_failure"
        return "signal_failure"
    
    # Infrastructure-Related Disruptions
    if "track" in disruption_lower or "infrastructure" in category_lower:
        if "blockage" in disruption_lower or "broken rail" in disruption_lower:
            return "track_block"
        if "maintenance" in disruption_lower or "engineering work" in disruption_lower:
            return "track_block"
        if "point" in disruption_lower or "turnout" in disruption_lower:
            return "track_block"
        if "bridge" in disruption_lower:
            return "track_block"
        return "track_block"
    
    # Environmental & Natural Disruptions
    if "weather" in category_lower or "environmental" in category_lower:
        if "fog" in disruption_lower:
            return "weather_slowdown"
        if "rain" in disruption_lower or "waterlogging" in disruption_lower:
            return "weather_slowdown"
        if "flood" in disruption_lower:
            return "track_block"  # Flooding blocks tracks
        if "heatwave" in disruption_lower:
            return "weather_slowdown"
        if "snow" in disruption_lower or "ice" in disruption_lower:
            return "weather_slowdown"
        return "weather_slowdown"
    
    # Rolling Stock / Train-Related Issues
    if "rolling stock" in category_lower or "locomotive" in disruption_lower:
        return "rolling_stock"
    
    # Operational Disruptions
    if "operational" in category_lower:
        if "platform" in disruption_lower or "congestion" in disruption_lower:
            return "platform_issue"
        return "operational"
    
    # External / Human-Induced
    if "external" in category_lower or "human" in category_lower:
        if "protest" in disruption_lower or "rail roko" in disruption_lower:
            return "track_block"
        if "trespassing" in disruption_lower:
            return "track_block"
        return "operational"
    
    # Default
    return "operational"


def _get_disruption_severity(disruption_name: str, category: str) -> str:
    """
    Determine severity based on disruption type.
    """
    disruption_lower = disruption_name.lower()
    
    # High severity
    if any(keyword in disruption_lower for keyword in [
        "signal failure", "track blockage", "bridge damage", "flooding",
        "landslide", "fire", "bomb scare", "earthquake"
    ]):
        return "high"
    
    # Medium severity
    if any(keyword in disruption_lower for keyword in [
        "maintenance", "fog", "heavy rain", "locomotive failure",
        "platform congestion", "crew unavailability"
    ]):
        return "medium"
    
    # Low severity
    return "low"


def _load_disruption_impact_mapping() -> Dict[str, Any]:
    """
    Load disruption impact mapping from JSON file.
    Returns mapping of disruption names to impact data.
    """
    try:
        data_path = Path(__file__).resolve().parents[2] / "data" / "disruption_impact_mapping.json"
        if data_path.exists():
            with open(data_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}
    except Exception as e:
        logger.warning(f"Failed to load disruption impact mapping: {e}")
        return {}


def _get_disruption_impact_data(disruption_name: str, category: str) -> Dict[str, Any]:
    """
    Get impact data for a specific disruption from the mapping.
    Returns delay minutes, throughput drop, speed reduction, etc.
    """
    impact_mapping = _load_disruption_impact_mapping()
    categories = impact_mapping.get("disruption_impacts", {})
    
    category_data = categories.get(category, {})
    impact_data = category_data.get(disruption_name)
    
    if impact_data:
        return impact_data
    
    # Fallback to default based on type
    disruption_type = _map_disruption_type_to_system_type(disruption_name, category)
    severity = _get_disruption_severity(disruption_name, category)
    
    # Default impacts based on severity
    default_impacts = {
        "low": {
            "base_delay_minutes": {"passenger": 8, "freight": 15},
            "throughput_drop_percent": 15,
            "speed_reduction": 0.0
        },
        "medium": {
            "base_delay_minutes": {"passenger": 20, "freight": 35},
            "throughput_drop_percent": 30,
            "speed_reduction": 0.0
        },
        "high": {
            "base_delay_minutes": {"passenger": 35, "freight": 55},
            "throughput_drop_percent": 50,
            "speed_reduction": 0.25
        }
    }
    
    default = default_impacts.get(severity, default_impacts["medium"])
    return {
        "type": disruption_type,
        "severity": severity,
        **default
    }


def _build_route_graph(sections_list: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Build a graph of all possible routes from sections.
    Returns adjacency list: {station_code: [connected_sections]}
    """
    graph = defaultdict(list)
    for section in sections_list:
        from_station = str(section.get("from_station", "")).upper().strip()
        to_station = str(section.get("to_station", "")).upper().strip()
        section_id = str(section.get("section_id", ""))
        
        if from_station and to_station:
            graph[from_station].append({
                "to": to_station,
                "section_id": section_id,
                "section": section
            })
            # Add reverse direction (bidirectional)
            graph[to_station].append({
                "to": from_station,
                "section_id": section_id,
                "section": section
            })
    
    return graph


def _find_alternative_route(
    graph: Dict[str, List[Dict[str, Any]]],
    start_station: str,
    end_station: str,
    blocked_sections: set,
    visited: set = None
) -> List[str]:
    """
    Find alternative route from start to end avoiding blocked sections.
    Returns list of station codes representing the route, or empty list if no route found.
    """
    if visited is None:
        visited = set()
    
    if start_station == end_station:
        return [start_station]
    
    if start_station in visited:
        return []
    
    visited.add(start_station)
    
    # BFS to find shortest alternative path
    queue = deque([(start_station, [start_station])])
    visited_bfs = {start_station}
    
    while queue:
        current, path = queue.popleft()
        
        if current == end_station:
            return path
        
        for neighbor_info in graph.get(current, []):
            neighbor = neighbor_info["to"]
            section_id = neighbor_info["section_id"]
            
            # Skip if section is blocked
            if section_id in blocked_sections:
                continue
            
            if neighbor not in visited_bfs:
                visited_bfs.add(neighbor)
                queue.append((neighbor, path + [neighbor]))
    
    return []  # No alternative route found


def _get_blocked_sections(disruptions: List[Dict[str, Any]]) -> set:
    """Extract set of blocked section IDs from disruptions."""
    blocked = set()
    for disruption in disruptions:
        if disruption.get("status") == "active":
            section_id = disruption.get("sectionId")
            if section_id:
                blocked.add(section_id)
            # Also check by station codes
            start_station = disruption.get("startStation")
            end_station = disruption.get("endStation")
            if start_station and end_station:
                # Add both directions
                blocked.add(f"{start_station}-{end_station}")
                blocked.add(f"{end_station}-{start_station}")
    return blocked


def _check_train_approaching_disruption(
    train_section_id: str,
    train_progress: float,
    disruptions: List[Dict[str, Any]],
    sections_list: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Check if train is approaching a disrupted section and should be held at station.
    Returns disruption info if train should wait, None otherwise.
    """
    if not train_section_id or train_progress > 0.1:  # Already in section
        return None
    
    # Find next section in route
    current_section = None
    for section in sections_list:
        if str(section.get("section_id", "")) == train_section_id:
            current_section = section
            break
    
    if not current_section:
        return None
    
    # Check if next section (from current section's end station) is disrupted
    current_to_station = str(current_section.get("to_station", "")).upper().strip()
    
    for disruption in disruptions:
        if disruption.get("status") != "active":
            continue
        
        disruption_start = disruption.get("startStation", "").upper().strip()
        disruption_section = disruption.get("sectionId", "")
        
        # Check if disruption starts from the station train is heading to
        if disruption_start == current_to_station:
            return disruption
        
        # Check by section ID
        if disruption_section:
            # Find section that starts from current_to_station
            for next_section in sections_list:
                next_from = str(next_section.get("from_station", "")).upper().strip()
                if next_from == current_to_station and str(next_section.get("section_id", "")) == disruption_section:
                    return disruption
    
    return None


def _calculate_comprehensive_kpis(
    trains: List[Dict[str, Any]],
    disruptions: List[Dict[str, Any]],
    sections_list: List[Dict[str, Any]],
    stations_list: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Calculate comprehensive KPIs for Itarsi-Bhopal section simulation.
    Covers all 5 categories: Train Performance, Speed & Travel, Disruption Impact,
    Operational Efficiency, and Simulation/Predictive metrics.
    """
    from datetime import datetime, timezone
    
    # Initialize KPI structures
    kpis = {
        # 1. Train Performance KPIs
        "train_performance": {
            "on_time_performance_percent": 0.0,
            "avg_delay_passenger_minutes": 0.0,
            "avg_delay_freight_minutes": 0.0,
            "max_delay_minutes": 0.0,
            "total_delay_per_station": {},
            "schedule_adherence_percent": 0.0
        },
        # 2. Speed & Travel KPIs
        "speed_travel": {
            "avg_speed_passenger_kmph": 0.0,
            "avg_speed_freight_kmph": 0.0,
            "speed_variance_passenger": 0.0,
            "speed_variance_freight": 0.0,
            "section_travel_times": {},
            "halt_time_analysis": {
                "total_halt_minutes": 0.0,
                "scheduled_halt_minutes": 0.0,
                "excess_halt_minutes": 0.0
            }
        },
        # 3. Disruption Impact KPIs
        "disruption_impact": {
            "delay_per_disruption_type": {},
            "affected_distance_km": 0.0,
            "affected_time_minutes": 0.0,
            "recovery_time_minutes": 0.0,
            "trains_affected_count": 0,
            "disruption_severity_score": 0.0
        },
        # 4. Operational Efficiency KPIs
        "operational_efficiency": {
            "passenger_freight_delay_ratio": 0.0,
            "train_density_per_hour": 0.0,
            "section_capacity_utilization_percent": 0.0,
            "cumulative_delay_trend": []
        },
        # 5. Simulation/Predictive KPIs
        "simulation_predictive": {
            "prediction_accuracy_percent": 0.0,
            "predicted_vs_actual_delay_error": 0.0,
            "scenario_impact_score": 0.0,
            "line_congestion_index": 0.0
        }
    }
    
    if not trains:
        return kpis
    
    # Separate trains by type
    passenger_trains = [t for t in trains if "PASSENGER" in str(t.get("trainType", "")).upper() or "EXPRESS" in str(t.get("trainType", "")).upper()]
    freight_trains = [t for t in trains if "FREIGHT" in str(t.get("trainType", "")).upper() or "GOODS" in str(t.get("trainType", "")).upper()]
    
    # 1. Train Performance KPIs
    delays_passenger = [t.get("delay", 0) for t in passenger_trains if t.get("delay", 0) > 0]
    delays_freight = [t.get("delay", 0) for t in freight_trains if t.get("delay", 0) > 0]
    all_delays = delays_passenger + delays_freight
    
    on_time_count = len([t for t in trains if t.get("delay", 0) <= 5])
    kpis["train_performance"]["on_time_performance_percent"] = round((on_time_count / len(trains)) * 100, 2) if trains else 0.0
    kpis["train_performance"]["avg_delay_passenger_minutes"] = round(sum(delays_passenger) / len(delays_passenger), 2) if delays_passenger else 0.0
    kpis["train_performance"]["avg_delay_freight_minutes"] = round(sum(delays_freight) / len(delays_freight), 2) if delays_freight else 0.0
    kpis["train_performance"]["max_delay_minutes"] = round(max(all_delays), 2) if all_delays else 0.0
    
    # Calculate delay per station (simplified - based on section positions)
    station_delays = defaultdict(float)
    for train in trains:
        section_id = train.get("position", {}).get("sectionId", "")
        delay = train.get("delay", 0)
        if section_id and delay > 0:
            # Find stations for this section
            for section in sections_list:
                if str(section.get("section_id", "")) == section_id:
                    from_station = str(section.get("from_station", "")).upper()
                    to_station = str(section.get("to_station", "")).upper()
                    station_delays[from_station] += delay * 0.5
                    station_delays[to_station] += delay * 0.5
                    break
    
    kpis["train_performance"]["total_delay_per_station"] = {k: round(v, 2) for k, v in station_delays.items()}
    
    # Schedule adherence (simplified - based on status)
    running_trains = len([t for t in trains if t.get("status") == "RUNNING"])
    kpis["train_performance"]["schedule_adherence_percent"] = round((running_trains / len(trains)) * 100, 2) if trains else 0.0
    
    # 2. Speed & Travel KPIs
    speeds_passenger = [t.get("speed", 0) for t in passenger_trains if t.get("speed", 0) > 0]
    speeds_freight = [t.get("speed", 0) for t in freight_trains if t.get("speed", 0) > 0]
    
    kpis["speed_travel"]["avg_speed_passenger_kmph"] = round(sum(speeds_passenger) / len(speeds_passenger), 2) if speeds_passenger else 0.0
    kpis["speed_travel"]["avg_speed_freight_kmph"] = round(sum(speeds_freight) / len(speeds_freight), 2) if speeds_freight else 0.0
    
    # Speed variance
    if speeds_passenger:
        mean_passenger = sum(speeds_passenger) / len(speeds_passenger)
        variance_passenger = sum((x - mean_passenger) ** 2 for x in speeds_passenger) / len(speeds_passenger)
        kpis["speed_travel"]["speed_variance_passenger"] = round(variance_passenger, 2)
    
    if speeds_freight:
        mean_freight = sum(speeds_freight) / len(speeds_freight)
        variance_freight = sum((x - mean_freight) ** 2 for x in speeds_freight) / len(speeds_freight)
        kpis["speed_travel"]["speed_variance_freight"] = round(variance_freight, 2)
    
    # Section travel times (simplified - based on section distance and speed)
    section_times = {}
    for section in sections_list:
        section_id = str(section.get("section_id", ""))
        distance = float(section.get("distance_km", 0.0))
        trains_on_section = [t for t in trains if t.get("position", {}).get("sectionId") == section_id]
        if trains_on_section:
            avg_speed = sum(t.get("speed", 0) for t in trains_on_section) / len(trains_on_section)
            if avg_speed > 0:
                travel_time = (distance / avg_speed) * 60  # minutes
                section_times[section_id] = round(travel_time, 2)
    
    kpis["speed_travel"]["section_travel_times"] = section_times
    
    # 3. Disruption Impact KPIs
    active_disruptions = [d for d in disruptions if d.get("status") == "active"]
    affected_trains = len([t for t in trains if t.get("status") in ["BLOCKED", "RESTRICTED", "QUEUED", "REROUTED"]])
    
    kpis["disruption_impact"]["trains_affected_count"] = affected_trains
    
    # Delay per disruption type
    delay_by_type = defaultdict(float)
    affected_distance = 0.0
    affected_time = 0.0
    
    for disruption in active_disruptions:
        disruption_type = disruption.get("type", "unknown")
        section_id = disruption.get("sectionId", "")
        
        # Find section distance
        for section in sections_list:
            if str(section.get("section_id", "")) == section_id:
                affected_distance += float(section.get("distance_km", 0.0))
                break
        
        affected_time += disruption.get("durationSeconds", 0) / 60.0  # Convert to minutes
        
        # Calculate delay caused by this disruption
        trains_affected_by_disruption = [t for t in trains if t.get("status") in ["BLOCKED", "RESTRICTED", "QUEUED"]]
        disruption_delay = sum(t.get("delay", 0) for t in trains_affected_by_disruption)
        delay_by_type[disruption_type] += disruption_delay
    
    kpis["disruption_impact"]["delay_per_disruption_type"] = {k: round(v, 2) for k, v in delay_by_type.items()}
    kpis["disruption_impact"]["affected_distance_km"] = round(affected_distance, 2)
    kpis["disruption_impact"]["affected_time_minutes"] = round(affected_time, 2)
    
    # Recovery time (time since last disruption ended)
    if active_disruptions:
        latest_disruption = max(active_disruptions, key=lambda d: d.get("startTime", ""))
        start_time_str = latest_disruption.get("startTime", "")
        duration_seconds = latest_disruption.get("durationSeconds", 0)
        try:
            start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
            end_time = start_time.replace(second=start_time.second + duration_seconds)
            now = datetime.now(timezone.utc)
            if now > end_time:
                recovery_time = (now - end_time).total_seconds() / 60.0
                kpis["disruption_impact"]["recovery_time_minutes"] = round(recovery_time, 2)
        except Exception:
            pass
    
    # Disruption severity score (weighted by impact)
    severity_scores = {"low": 0.3, "medium": 0.6, "high": 1.0}
    total_severity = sum(severity_scores.get(d.get("severity", "medium"), 0.5) for d in active_disruptions)
    kpis["disruption_impact"]["disruption_severity_score"] = round(total_severity / len(active_disruptions), 2) if active_disruptions else 0.0
    
    # 4. Operational Efficiency KPIs
    avg_passenger_delay = kpis["train_performance"]["avg_delay_passenger_minutes"]
    avg_freight_delay = kpis["train_performance"]["avg_delay_freight_minutes"]
    if avg_freight_delay > 0:
        kpis["operational_efficiency"]["passenger_freight_delay_ratio"] = round(avg_passenger_delay / avg_freight_delay, 2)
    
    # Train density (trains per hour - simplified)
    kpis["operational_efficiency"]["train_density_per_hour"] = len(trains)  # Assuming 1-hour window
    
    # Section capacity utilization
    total_sections = len(sections_list)
    sections_with_trains = len(set(t.get("position", {}).get("sectionId") for t in trains if t.get("position", {}).get("sectionId")))
    kpis["operational_efficiency"]["section_capacity_utilization_percent"] = round((sections_with_trains / total_sections) * 100, 2) if total_sections > 0 else 0.0
    
    # 5. Simulation/Predictive KPIs
    # Prediction accuracy (simplified - based on delay variance)
    if all_delays:
        delay_variance = sum((d - sum(all_delays)/len(all_delays)) ** 2 for d in all_delays) / len(all_delays)
        # Lower variance = higher accuracy
        kpis["simulation_predictive"]["prediction_accuracy_percent"] = round(max(0, 100 - delay_variance * 2), 2)
    
    # Line congestion index
    trains_per_section = defaultdict(int)
    for train in trains:
        section_id = train.get("position", {}).get("sectionId", "")
        if section_id:
            trains_per_section[section_id] += 1
    
    max_trains_on_section = max(trains_per_section.values()) if trains_per_section else 0
    # Assuming max capacity of 3 trains per section
    kpis["simulation_predictive"]["line_congestion_index"] = round(min(1.0, max_trains_on_section / 3.0), 3)
    
    # Scenario impact score (combination of all factors)
    impact_score = (
        (affected_trains / len(trains)) * 0.3 +
        (sum(all_delays) / max(1, len(all_delays))) * 0.01 +
        (total_severity / max(1, len(active_disruptions))) * 0.4 +
        (max_trains_on_section / 3.0) * 0.3
    )
    kpis["simulation_predictive"]["scenario_impact_score"] = round(min(1.0, impact_score), 3)
    
    return kpis


def _calculate_disruption_impact_metrics(
    trains: List[Dict[str, Any]],
    disruptions: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Calculate overall system impact metrics from disruptions."""
    affected_trains = 0
    total_passenger_delay = 0
    total_freight_delay = 0
    passenger_count = 0
    freight_count = 0
    trains_in_queue = 0
    trains_rerouted = 0
    
    for train in trains:
        train_type_upper = str(train.get("trainType", "")).upper()
        is_passenger = "PASSENGER" in train_type_upper or "EXPRESS" in train_type_upper
        is_freight = "FREIGHT" in train_type_upper or "GOODS" in train_type_upper
        
        status = train.get("status", "")
        delay = train.get("delay", 0)
        
        if status in ["BLOCKED", "RESTRICTED", "REROUTED", "QUEUED"]:
            affected_trains += 1
        
        if status == "QUEUED":
            trains_in_queue += 1
        
        if train.get("rerouted"):
            trains_rerouted += 1
        
        if delay > 0:
            if is_passenger:
                total_passenger_delay += delay
                passenger_count += 1
            elif is_freight:
                total_freight_delay += delay
                freight_count += 1
    
    avg_passenger_delay = total_passenger_delay / passenger_count if passenger_count > 0 else 0
    avg_freight_delay = total_freight_delay / freight_count if freight_count > 0 else 0
    
    # Calculate throughput impact
    total_throughput_drop = 0
    for disruption in disruptions:
        if disruption.get("status") == "active":
            throughput_drop = disruption.get("throughput_drop_percent", 0)
            total_throughput_drop += throughput_drop
    
    return {
        "affected_trains": affected_trains,
        "total_trains": len(trains),
        "trains_in_queue": trains_in_queue,
        "trains_rerouted": trains_rerouted,
        "total_passenger_delay_minutes": round(total_passenger_delay, 1),
        "total_freight_delay_minutes": round(total_freight_delay, 1),
        "avg_passenger_delay_minutes": round(avg_passenger_delay, 1),
        "avg_freight_delay_minutes": round(avg_freight_delay, 1),
        "throughput_impact_percent": round(min(total_throughput_drop, 100), 1),
        "active_disruptions": len([d for d in disruptions if d.get("status") == "active"])
    }


def _generate_sample_trains_itarsi_bhopal(sections_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate 10 passenger trains and 20 freight trains for Itarsi-Bhopal route.
    """
    trains = []
    
    # Passenger train names
    passenger_names = [
        "Bhopal Express", "Itarsi Passenger", "Narmada Express", "Bhopal Superfast",
        "Itarsi Fast", "Bhopal Mail", "Narmada Passenger", "Bhopal Local",
        "Itarsi Express", "Bhopal Special"
    ]
    
    # Freight train names
    freight_names = [
        "Goods Train", "Freight Express", "Cargo Train", "Goods Special",
        "Freight Loader", "Cargo Express", "Goods Carrier", "Freight Runner",
        "Cargo Loader", "Goods Runner", "Freight Carrier", "Cargo Carrier",
        "Goods Express", "Freight Loader", "Cargo Runner", "Goods Loader",
        "Freight Express", "Cargo Special", "Goods Carrier", "Freight Special"
    ]
    
    # Calculate total route distance
    total_distance = sum(float(s.get("distance_km", 0.0)) for s in sections_list)
    
    # Generate 10 passenger trains
    for i in range(10):
        train_no = f"P{12900 + i}"
        # Distribute trains along the route (0 to 0.9 progress)
        progress = (i / 10.0) * 0.9
        
        # Find which section the train is on
        cumulative_km = 0.0
        section_id = sections_list[0].get("section_id", "")
        section_progress = 0.0
        
        for section in sections_list:
            section_dist = float(section.get("distance_km", 0.0))
            if cumulative_km + section_dist >= progress * total_distance:
                section_id = section.get("section_id", "")
                section_progress = (progress * total_distance - cumulative_km) / section_dist if section_dist > 0 else 0.0
                break
            cumulative_km += section_dist
        
        trains.append({
            "trainNo": train_no,
            "trainName": passenger_names[i % len(passenger_names)],
            "trainType": "PASSENGER",
            "position": {
                "sectionId": section_id,
                "progress": max(0.0, min(1.0, section_progress))
            },
            "speed": random.randint(70, 100),
            "status": "RUNNING",
            "delay": random.randint(0, 15)
        })
    
    # Generate 20 freight trains
    for i in range(20):
        train_no = f"F{80000 + i}"
        # Distribute trains along the route (0 to 0.95 progress)
        progress = (i / 20.0) * 0.95
        
        # Find which section the train is on
        cumulative_km = 0.0
        section_id = sections_list[0].get("section_id", "")
        section_progress = 0.0
        
        for section in sections_list:
            section_dist = float(section.get("distance_km", 0.0))
            if cumulative_km + section_dist >= progress * total_distance:
                section_id = section.get("section_id", "")
                section_progress = (progress * total_distance - cumulative_km) / section_dist if section_dist > 0 else 0.0
                break
            cumulative_km += section_dist
        
        trains.append({
            "trainNo": train_no,
            "trainName": freight_names[i % len(freight_names)],
            "trainType": "FREIGHT",
            "position": {
                "sectionId": section_id,
                "progress": max(0.0, min(1.0, section_progress))
            },
            "speed": random.randint(50, 75),
            "status": "RUNNING",
            "delay": random.randint(0, 30)
        })
    
    return trains


@router.get("/india/map")
def get_india_railway_map() -> Dict[str, Any]:
    """
    Get aggregated map data for all divisions (India railway network).
    """
    try:
        logger.info("Starting India railway map data aggregation...")
        VALID_DIVISIONS = ["mumbai", "pune", "bhusaval", "nagpur", "solapur", "itarsi_bhopal"]

        all_stations = []
        all_sections = []
        station_codes_seen = set()

        for division in VALID_DIVISIONS:
            try:
                dataset = load_division_dataset(division)

                # Get stations
                stations_df = dataset.get("stations")
                stations_list = normalize_stations(stations_df) if stations_df is not None and not stations_df.empty else []

                # Get sections
                sections_df = dataset.get("sections")
                sections_list = normalize_sections(sections_df) if sections_df is not None and not sections_df.empty else []

                # Add stations (avoid duplicates by station code)
                for station in stations_list:
                    station_code = str(station.get("code", "")).upper()
                    if station_code and station_code not in station_codes_seen:
                        all_stations.append({
                            "stationCode": station_code,
                            "stationName": str(station.get("name", "")),
                            "lat": float(station.get("lat", 0.0)),
                            "lon": float(station.get("lon", 0.0)),
                            "division": division,
                            "isJunction": bool(station.get("is_junction", False))
                        })
                        station_codes_seen.add(station_code)

                # Add sections
                for section in sections_list:
                    from_station = str(section.get("from_station", "")).upper()
                    to_station = str(section.get("to_station", "")).upper()

                    distance_km = float(section.get("distance_km", 0.0))
                    is_trunk = distance_km > 50.0

                    all_sections.append({
                        "section_id": str(section.get("section_id", "")),
                        "from": from_station,
                        "to": to_station,
                        "division": division,
                        "isTrunk": is_trunk,
                        "distanceKm": distance_km
                    })

            except Exception as e:
                logger.warning(f"Failed to load data for division {division}: {e}")
                continue

        result = {
            "stations": all_stations,
            "sections": all_sections
        }

        logger.info(f"Returning India map data: {len(all_stations)} stations, {len(all_sections)} sections")

        if not all_stations:
            logger.warning("No stations found in any division - returning empty result")
        if not all_sections:
            logger.warning("No sections found in any division - returning empty result")

        return result

    except Exception as e:
        logger.error(f"Failed to load India map data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load India map data: {str(e)}")


@router.get("/india/positions")
async def get_india_railway_positions() -> Dict[str, Any]:
    """
    Get live train positions for all divisions (India railway network).
    """
    try:
        VALID_DIVISIONS = ["mumbai", "pune", "bhusaval", "nagpur", "solapur", "itarsi_bhopal"]

        all_trains = []

        for division in VALID_DIVISIONS:
            try:
                dataset = load_division_dataset(division)
                sections_df = dataset.get("sections")

                sections_list = []
                if sections_df is not None and not sections_df.empty:
                    try:
                        sections_list = sections_df.to_dict('records')
                    except Exception as e:
                        logger.warning(f"Failed to build section map for {division}: {e}")

                try:
                    from app.services.train_merger import get_merged_live_trains
                    merged_data = await get_merged_live_trains(division)

                    for train_data in merged_data.get("trains", []):
                        train_id = str(train_data.get("id", "") or train_data.get("train_id", "") or train_data.get("train_no", ""))
                        if not train_id:
                            continue

                        position_km = train_data.get("position_km", 0.0)
                        section_id = None
                        progress = 0.0

                        if sections_list and position_km > 0:
                            cumulative_km = 0.0
                            for section in sections_list:
                                section_dist = float(section.get("distance_km", 0.0))
                                if cumulative_km <= position_km <= cumulative_km + section_dist:
                                    section_id = str(section.get("section_id", ""))
                                    progress = (position_km - cumulative_km) / section_dist if section_dist > 0 else 0.0
                                    break
                                cumulative_km += section_dist

                        if not section_id and sections_list:
                            first_section = sections_list[0]
                            section_id = str(first_section.get("section_id", ""))
                            progress = 0.0

                        speed_val = train_data.get("speed")
                        speed = float(speed_val) if speed_val is not None else 0.0

                        delay_val = train_data.get("delay_minutes", 0)
                        delay = int(delay_val) if delay_val is not None else 0

                        train_info = {
                            "trainNo": train_id,
                            "trainName": train_data.get("name", ""),
                            "trainType": train_data.get("type", "EXPRESS"),
                            "position": {
                                "sectionId": section_id or "",
                                "progress": max(0.0, min(1.0, progress))
                            },
                            "speed": speed,
                            "status": "RUNNING" if speed > 0 else "STOPPED",
                            "delay": delay,
                            "division": division
                        }
                        all_trains.append(train_info)

                except Exception as e:
                    logger.warning(f"Failed to get merged live trains for {division}: {e}")
                    continue

            except Exception as e:
                logger.warning(f"Failed to process division {division}: {e}")
                continue

        result = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "trains": all_trains
        }

        return result

    except Exception as e:
        logger.error(f"Failed to get India positions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get India positions: {str(e)}")



@router.get("/{division}/map")
def get_digital_twin_map(division: str = PathParam(..., description="Division name (e.g., mumbai, pune)")) -> Dict[str, Any]:
    """
    Get static map data for a division (stations and sections).
    
    Returns graph structure WITHOUT coordinates - layout computed frontend-side.
    
    Returns:
    {
        "division": "mumbai",
        "stations": [
            {
                "stationCode": "MMCT",
                "stationName": "Mumbai Central"
            },
            ...
        ],
        "sections": [
            {
                "from": "MMCT",
                "to": "DR"
            },
            ...
        ]
    }
    """
    try:
        division_lower = division.lower().strip().replace("-", "_")
        
        # Load division dataset using existing loader
        dataset = load_division_dataset(division_lower)
        
        # Get stations DataFrame and normalize
        stations_df = dataset.get("stations")
        stations_list = normalize_stations(stations_df) if stations_df is not None and not stations_df.empty else []
        
        # Get sections DataFrame and normalize
        sections_df = dataset.get("sections")
        sections_list = normalize_sections(sections_df) if sections_df is not None and not sections_df.empty else []
        
        # Check if data is empty - return 404 as specified
        if not stations_list or not sections_list:
            logger.warning(f"Map data not found for division {division_lower}: stations={len(stations_list)}, sections={len(sections_list)}")
            raise HTTPException(status_code=404, detail="Map data not found")
        
        # Return stationCode/stationName WITH lat/lon coordinates for map rendering
        stations_result = [
            {
                "stationCode": str(station.get("code", "")),
                "stationName": str(station.get("name", "")),
                "lat": float(station.get("lat", 0.0)),
                "lon": float(station.get("lon", 0.0))
            }
            for station in stations_list
        ]
        
        sections_result = [
            {
                "section_id": str(section.get("section_id", "")),
                "from": str(section.get("from_station", "")),
                "to": str(section.get("to_station", ""))
            }
            for section in sections_list
        ]
        
        result = {
            "division": division_lower,
            "stations": stations_result,
            "sections": sections_result
        }
        
        logger.info(f"Returning map data for {division_lower}: {len(stations_result)} stations, {len(sections_result)} sections")
        return result
        
    except HTTPException:
        # Re-raise HTTP exceptions (like 404)
        raise
    except ValueError as e:
        logger.error(f"Invalid division or data error for {division}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to load map data for division {division}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load map data: {str(e)}")


@router.get("/{division}/positions")
async def get_digital_twin_positions(
    division: str = PathParam(..., description="Division name (e.g., mumbai, pune)"),
    include_rerouting: bool = True
) -> Dict[str, Any]:
    """
    Get live train positions for a division.
    
    Returns:
    {
        "timestamp": "2024-01-01T12:00:00Z",
        "trains": [
            {
                "trainNo": "12104",
                "trainName": "Mumbai Express",
                "trainType": "SUPERFAST",
                "position": {
                    "sectionId": "MUM_S5",
                    "progress": 0.35
                },
                "speed": 85,
                "status": "RUNNING",
                "delay": 0
            },
            ...
        ]
    }
    """
    try:
        division_lower = division.lower().strip().replace("-", "_")
        
        # Load division dataset to get sections
        dataset = load_division_dataset(division_lower)
        sections_df = dataset.get("sections")
        
        # Build sections list for position calculation
        sections_list = []
        section_map = {}
        if sections_df is not None and not sections_df.empty:
            try:
                sections_list = sections_df.to_dict('records')
                for section in sections_list:
                    section_id = str(section.get("section_id", ""))
                    if section_id:
                        section_map[section_id] = section
            except Exception as e:
                logger.warning(f"Failed to build section map: {e}")
        
        # Get active disruptions for rerouting
        disruptions = []
        blocked_sections = set()
        route_graph = {}
        if include_rerouting:
            try:
                disruptions_response = await get_digital_twin_disruptions(division_lower)
                disruptions = disruptions_response.get("disruptions", [])
                blocked_sections = _get_blocked_sections(disruptions)
                # Build route graph for alternative path finding
                if sections_list:
                    route_graph = _build_route_graph(sections_list)
            except Exception as e:
                logger.warning(f"Failed to get disruptions for rerouting: {e}")
        
        # Try to get merged live trains
        try:
            from app.services.train_merger import get_merged_live_trains
            merged_data = await get_merged_live_trains(division_lower)
            
            trains = []
            for train_data in merged_data.get("trains", []):
                train_id = str(train_data.get("id", "") or train_data.get("train_id", "") or train_data.get("train_no", ""))
                if not train_id:
                    continue
                
                # Find section based on position_km
                position_km = train_data.get("position_km", 0.0)
                section_id = None
                progress = 0.0
                
                # Try to find which section the train is on
                original_section_id = None
                rerouted = False
                alternative_route = []
                
                if sections_list and position_km > 0:
                    cumulative_km = 0.0
                    for section in sections_list:
                        section_dist = float(section.get("distance_km", 0.0))
                        if cumulative_km <= position_km <= cumulative_km + section_dist:
                            original_section_id = str(section.get("section_id", ""))
                            progress = (position_km - cumulative_km) / section_dist if section_dist > 0 else 0.0
                            
                            # Check if this section is blocked and find alternative route
                            if include_rerouting and original_section_id in blocked_sections and route_graph:
                                from_station = str(section.get("from_station", "")).upper().strip()
                                to_station = str(section.get("to_station", "")).upper().strip()
                                
                                # Find alternative route
                                alt_route = _find_alternative_route(
                                    route_graph,
                                    from_station,
                                    to_station,
                                    blocked_sections
                                )
                                
                                if alt_route and len(alt_route) > 2:  # Alternative route found
                                    rerouted = True
                                    alternative_route = alt_route
                                    # Use first section of alternative route
                                    for alt_section in sections_list:
                                        alt_from = str(alt_section.get("from_station", "")).upper().strip()
                                        alt_to = str(alt_section.get("to_station", "")).upper().strip()
                                        if (alt_from == alt_route[0] and alt_to == alt_route[1]) or \
                                           (alt_from == alt_route[1] and alt_to == alt_route[0]):
                                            section_id = str(alt_section.get("section_id", ""))
                                            progress = 0.1  # Start of alternative route
                                            break
                                else:
                                    # No alternative route, train is stopped/waiting
                                    section_id = original_section_id
                                    progress = 0.0  # Train stopped at start of blocked section
                            else:
                                section_id = original_section_id
                            break
                        cumulative_km += section_dist
                
                # Default to first section if not found
                if not section_id and sections_list:
                    first_section = sections_list[0]
                    section_id = str(first_section.get("section_id", ""))
                    progress = 0.0
                
                # Safely convert speed and delay, handling None values
                speed_val = train_data.get("speed")
                base_speed = float(speed_val) if speed_val is not None else 0.0
                
                # Apply speed reduction if train is in disrupted section
                speed = base_speed
                if section_id and disruptions:
                    for disruption in disruptions:
                        if disruption.get("status") == "active":
                            disruption_section = disruption.get("sectionId")
                            if disruption_section == section_id:
                                # Apply speed reduction factor for signal failures
                                if disruption.get("type") == "signal_failure":
                                    speed_reduction = disruption.get("speed_reduction_factor", 1.0)
                                    speed = base_speed * speed_reduction
                                    # Ensure minimum restricted speed
                                    restricted_speed = disruption.get("restricted_speed_kmph")
                                    if restricted_speed and speed < restricted_speed:
                                        speed = restricted_speed
                                break
                
                delay_val = train_data.get("delay_minutes", 0)
                delay = int(delay_val) if delay_val is not None else 0
                
                # Add delay based on disruption impact
                if section_id and disruptions:
                    for disruption in disruptions:
                        if disruption.get("status") == "active" and disruption.get("sectionId") == section_id:
                            train_type_upper = str(train_data.get("type", "")).upper()
                            if "FREIGHT" in train_type_upper or "GOODS" in train_type_upper:
                                delay += disruption.get("freight_delay_minutes", 0)
                            else:
                                delay += disruption.get("passenger_delay_minutes", 0)
                            break
                
                # Check if train is approaching a disrupted section (should be held at station)
                approaching_disruption = None
                if progress < 0.1 and sections_list:  # Train at start of section
                    approaching_disruption = _check_train_approaching_disruption(
                        section_id, progress, disruptions, sections_list
                    )
                
                # Determine status based on rerouting and disruptions
                train_status = "RUNNING" if speed > 0 else "STOPPED"
                
                # Priority: QUEUED > REROUTED > RESTRICTED/BLOCKED > RUNNING
                if approaching_disruption and progress < 0.05:
                    # Train should wait at station - apply priority logic
                    train_type_upper = str(train_data.get("type", "")).upper()
                    is_passenger = "PASSENGER" in train_type_upper or "EXPRESS" in train_type_upper
                    
                    # Passenger trains get priority - they can proceed with restricted speed
                    # Freight trains wait in queue
                    if is_passenger and approaching_disruption.get("type") == "signal_failure":
                        train_status = "RESTRICTED"  # Passenger can proceed with restrictions
                    else:
                        train_status = "QUEUED"  # Freight waits, or complete block
                elif rerouted:
                    train_status = "REROUTED"
                elif section_id in blocked_sections:
                    # Check if it's signal failure (restricted movement) vs complete block
                    is_signal_failure = False
                    for disruption in disruptions:
                        if disruption.get("status") == "active" and disruption.get("sectionId") == section_id:
                            if disruption.get("type") == "signal_failure":
                                is_signal_failure = True
                                train_status = "RESTRICTED"  # Restricted speed movement
                            else:
                                train_status = "BLOCKED"
                            break
                    if not is_signal_failure:
                        train_status = "BLOCKED"
                
                train_info = {
                    "trainNo": train_id,
                    "trainName": train_data.get("name", ""),
                    "trainType": train_data.get("type", "EXPRESS"),
                    "position": {
                        "sectionId": section_id or "",
                        "progress": max(0.0, min(1.0, progress))
                    },
                    "speed": speed,
                    "status": train_status,
                    "delay": delay,
                    "rerouted": rerouted,
                    "alternativeRoute": alternative_route if rerouted else None,
                    "originalSection": original_section_id if rerouted else None
                }
                trains.append(train_info)
            
            # Calculate overall impact metrics
            impact_metrics = _calculate_disruption_impact_metrics(trains, disruptions)
            
            # Calculate comprehensive KPIs
            stations_df = dataset.get("stations")
            stations_list = []
            if stations_df is not None and not stations_df.empty:
                stations_list = normalize_stations(stations_df)
            
            comprehensive_kpis = _calculate_comprehensive_kpis(trains, disruptions, sections_list, stations_list)
            
            result = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "trains": trains,
                "impact_metrics": impact_metrics,
                "kpis": comprehensive_kpis
            }
            
            return result
            
        except Exception as e:
            logger.warning(f"Failed to get merged live trains, returning empty list: {e}")
            # For itarsi_bhopal, generate sample trains if no real data
            if division_lower == "itarsi_bhopal" and sections_list:
                trains = _generate_sample_trains_itarsi_bhopal(sections_list)
                # Apply rerouting logic to sample trains if disruptions exist
                if include_rerouting and blocked_sections:
                    route_graph = _build_route_graph(sections_list)
                    for train in trains:
                        section_id = train.get("position", {}).get("sectionId", "")
                        if section_id in blocked_sections:
                            # Find alternative route for sample train
                            section_data = section_map.get(section_id)
                            if section_data and route_graph:
                                from_station = str(section_data.get("from_station", "")).upper().strip()
                                to_station = str(section_data.get("to_station", "")).upper().strip()
                                
                                alt_route = _find_alternative_route(
                                    route_graph,
                                    from_station,
                                    to_station,
                                    blocked_sections
                                )
                                
                                if alt_route and len(alt_route) > 2:
                                    train["status"] = "REROUTED"
                                    train["rerouted"] = True
                                    train["alternativeRoute"] = alt_route
                                    train["originalSection"] = section_id
                                    # Update to first section of alternative route
                                    for alt_section in sections_list:
                                        alt_from = str(alt_section.get("from_station", "")).upper().strip()
                                        alt_to = str(alt_section.get("to_station", "")).upper().strip()
                                        if (alt_from == alt_route[0] and alt_to == alt_route[1]) or \
                                           (alt_from == alt_route[1] and alt_to == alt_route[0]):
                                            train["position"]["sectionId"] = str(alt_section.get("section_id", ""))
                                            train["position"]["progress"] = 0.1
                                            break
                                else:
                                    train["status"] = "BLOCKED"
                                    train["position"]["progress"] = 0.0
                
                # Calculate impact metrics for sample trains
                impact_metrics = _calculate_disruption_impact_metrics(trains, disruptions) if disruptions else {}
                
                # Calculate comprehensive KPIs
                stations_df = dataset.get("stations")
                stations_list = []
                if stations_df is not None and not stations_df.empty:
                    stations_list = normalize_stations(stations_df)
                
                comprehensive_kpis = _calculate_comprehensive_kpis(trains, disruptions, sections_list, stations_list)
                
                result = {
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "trains": trains,
                    "impact_metrics": impact_metrics,
                    "kpis": comprehensive_kpis
                }
                return result
            
            # Fallback to empty list
            empty_kpis = {
                "train_performance": {},
                "speed_travel": {},
                "disruption_impact": {},
                "operational_efficiency": {},
                "simulation_predictive": {}
            }
            result = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "trains": [],
                "impact_metrics": {
                    "affected_trains": 0,
                    "total_trains": 0,
                    "trains_in_queue": 0,
                    "trains_rerouted": 0,
                    "total_passenger_delay_minutes": 0,
                    "total_freight_delay_minutes": 0,
                    "avg_passenger_delay_minutes": 0,
                    "avg_freight_delay_minutes": 0,
                    "throughput_impact_percent": 0,
                    "active_disruptions": 0
                },
                "kpis": empty_kpis
            }
            return result
        
    except ValueError as e:
        logger.error(f"Invalid division for positions {division}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get positions for division {division}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get positions: {str(e)}")


def _calculate_signal_failure_impact(disruption: Dict[str, Any], section_data: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Calculate realistic operational impact of signal failure disruption.
    Based on Railway signalling fail-safe principles and TA-912 authority requirements.
    """
    severity = disruption.get("severity", "medium")
    
    # Base impact parameters for signal failure
    impact_params = {
        "low": {
            "speed_reduction_factor": 0.5,  # 50% speed reduction
            "block_clearance_multiplier": 1.5,  # 1.5x normal time
            "throughput_drop": 0.15,  # 15% drop
            "delay_minutes": 8,
            "requires_ta912": False
        },
        "medium": {
            "speed_reduction_factor": 0.35,  # 35% speed (restricted speed ~25-30 km/h)
            "block_clearance_multiplier": 2.0,  # 2x normal time
            "throughput_drop": 0.25,  # 25% drop
            "delay_minutes": 15,
            "requires_ta912": True
        },
        "high": {
            "speed_reduction_factor": 0.25,  # 25% speed (15-30 km/h restricted)
            "block_clearance_multiplier": 2.5,  # 2.5x normal time (6-7 min → 15-20 min)
            "throughput_drop": 0.40,  # 40% drop
            "delay_minutes": 22,
            "requires_ta912": True,
            "impact_score": 0.8,
            "restricted_speed_kmph": 28  # ~28 km/h restricted speed
        }
    }
    
    params = impact_params.get(severity, impact_params["medium"])
    
    # Calculate block clearance time if section data available
    normal_block_clearance_min = 6.0  # Normal: 6-7 minutes
    if section_data:
        distance_km = float(section_data.get("distance_km", 27.0))
        normal_speed_kmph = float(section_data.get("max_speed_kmph", 115.0))
        normal_block_clearance_min = (distance_km / normal_speed_kmph) * 60.0
    
    affected_block_clearance_min = normal_block_clearance_min * params["block_clearance_multiplier"]
    
    # Calculate delay based on train type
    passenger_delay = params["delay_minutes"]
    freight_delay = params["delay_minutes"] + 10  # Freight gets additional 10-15 min delay
    
    return {
        "speed_reduction_factor": params["speed_reduction_factor"],
        "block_clearance_time_min": round(affected_block_clearance_min, 1),
        "normal_block_clearance_time_min": round(normal_block_clearance_min, 1),
        "throughput_drop_percent": round(params["throughput_drop"] * 100, 1),
        "throughput_drop_factor": params["throughput_drop"],
        "requires_ta912_authority": params["requires_ta912"],
        "restricted_speed_kmph": params.get("restricted_speed_kmph") or round(115.0 * params["speed_reduction_factor"], 0),
        "passenger_delay_minutes": passenger_delay,
        "freight_delay_minutes": freight_delay,
        "impact_score": params.get("impact_score", 0.6),
        "operational_mode": "FAIL_SAFE",
        "description_detail": f"Signal failure - Fail-safe mode activated. "
                            f"Trains require manual TA-912 authority for restricted speed movement "
                            f"({params['restricted_speed_kmph'] if 'restricted_speed_kmph' in params else round(115.0 * params['speed_reduction_factor'], 0)} km/h). "
                            f"Block clearance time increased from {round(normal_block_clearance_min, 1)} min to {round(affected_block_clearance_min, 1)} min."
    }


@router.get("/{division}/disruptions")
async def get_digital_twin_disruptions(division: str = PathParam(..., description="Division name (e.g., mumbai, pune)")) -> Dict[str, Any]:
    """
    Get active disruptions for a division.
    
    Returns:
    {
        "timestamp": "2024-01-01T12:00:00Z",
        "disruptions": [
            {
                "id": "d1",
                "type": "signal_failure",
                "description": "Signal failure at NDPM",
                "sectionId": "NDPM-ODG",
                "startStation": "NDPM",
                "endStation": "ODG",
                "startTime": "2024-01-01T12:00:00Z",
                "durationSeconds": 1500,
                "severity": "high",
                "status": "active"
            },
            ...
        ]
    }
    """
    try:
        division_lower = division.lower().strip().replace("-", "_")
        
        # Load division dataset to get disruptions
        dataset = load_division_dataset(division_lower)
        disruptions_df = dataset.get("disruptions")
        
        disruptions_list = []
        
        # Also try to load from railway_disruptions.csv if division-specific disruptions not found
        disruption_catalog = _load_disruption_catalog()
        
        # Parse disruptions from CSV if available
        if disruptions_df is not None and not disruptions_df.empty:
            try:
                disruptions_list = disruptions_df.to_dict('records')
                # Transform to API format
                disruptions_result = []
                for disruption in disruptions_list:
                    disruption_id = str(disruption.get("id", "") or disruption.get("disruption_id", ""))
                    if not disruption_id:
                        # Generate ID from disruption name if available
                        disruption_name = str(disruption.get("disruption", "") or disruption.get("name", ""))
                        if disruption_name:
                            disruption_id = f"d_{hash(disruption_name) % 10000}"
                        else:
                            continue
                    
                    # Map disruption type - check if it's from catalog format
                    if "category" in disruption and "disruption" in disruption:
                        # This is from railway_disruptions.csv format
                        disruption_name = str(disruption.get("disruption", ""))
                        category = str(disruption.get("category", ""))
                        disruption_type = _map_disruption_type_to_system_type(disruption_name, category)
                        severity = _get_disruption_severity(disruption_name, category)
                    else:
                        # Standard format
                        disruption_type = str(disruption.get("type", "")).lower()
                        if not disruption_type:
                            disruption_type = "signal_failure"  # default
                        severity = str(disruption.get("severity", "medium")).lower()
                    
                    # Get section info
                    section_id = str(disruption.get("section_id", "") or disruption.get("section", ""))
                    start_station = str(disruption.get("start_station", "") or disruption.get("from_station", ""))
                    end_station = str(disruption.get("end_station", "") or disruption.get("to_station", ""))
                    
                    # Parse times
                    start_time_str = str(disruption.get("start_time", "") or disruption.get("start_at", ""))
                    duration_seconds = int(disruption.get("duration_seconds", 0) or disruption.get("duration_minutes", 0) * 60)
                    
                    # Calculate if disruption is still active
                    from datetime import datetime, timezone
                    now = datetime.now(timezone.utc)
                    start_time = now  # Default to now if not specified
                    
                    try:
                        if start_time_str:
                            # Try parsing ISO format or other formats
                            start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
                    except Exception:
                        pass
                    
                    end_time = start_time.replace(second=start_time.second + duration_seconds)
                    is_active = now < end_time
                    
                    # Get description
                    if "category" in disruption and "disruption" in disruption:
                        description = f"{disruption.get('disruption', '')} - {disruption.get('category', '')}"
                    else:
                        description = str(disruption.get("description", "") or disruption.get("reason", "") or disruption.get("disruption", "") or f"{disruption_type} disruption")
                    
                    disruptions_result.append({
                        "id": disruption_id,
                        "type": disruption_type,
                        "description": description,
                        "sectionId": section_id,
                        "startStation": start_station,
                        "endStation": end_station,
                        "startTime": start_time.isoformat(),
                        "durationSeconds": duration_seconds,
                        "severity": severity,
                        "status": "active" if is_active else "resolved",
                        "category": disruption.get("category") if "category" in disruption else None
                    })
                
                disruptions_list = disruptions_result
            except Exception as e:
                logger.warning(f"Failed to parse disruptions for {division_lower}: {e}")
        
        # For demo purposes, generate some sample disruptions for itarsi_bhopal
        # Use disruption catalog to create realistic disruptions
        if division_lower == "itarsi_bhopal" and len(disruptions_list) == 0:
            # Try to use catalog to generate realistic disruptions
            if disruption_catalog:
                # Select a few realistic disruptions from catalog
                signal_failures = [d for d in disruption_catalog if "signal" in d.get("disruption", "").lower()]
                track_blocks = [d for d in disruption_catalog if "track" in d.get("disruption", "").lower() or "maintenance" in d.get("disruption", "").lower()]
                weather = [d for d in disruption_catalog if "fog" in d.get("disruption", "").lower() or "rain" in d.get("disruption", "").lower()]
                
                # Generate disruptions based on catalog
                from datetime import datetime, timezone, timedelta
                now = datetime.now(timezone.utc)
                
                generated_disruptions = []
                
                # Get impact mapping for realistic delays
                impact_mapping = _load_disruption_impact_mapping()
                impact_data = impact_mapping.get("disruption_impacts", {})
                
                # Signal failure example
                if signal_failures:
                    signal_item = signal_failures[0]
                    disruption_name = signal_item.get("disruption", "")
                    category = signal_item.get("category", "")
                    
                    # Get impact data
                    category_impacts = impact_data.get(category, {})
                    disruption_impact = category_impacts.get(disruption_name, {})
                    
                    # Use impact data for duration and delay
                    base_delay = disruption_impact.get("base_delay_minutes", {}).get("passenger", 22)
                    recovery_time = disruption_impact.get("recovery_time_minutes", 45)
                    duration_seconds = max(1800, recovery_time * 60)  # At least 30 min or recovery time
                    
                    signal_disruption = {
                        "id": "d1",
                        "type": _map_disruption_type_to_system_type(disruption_name, category),
                        "description": f"{disruption_name} - {category}",
                        "sectionId": "NDPM-ODG",
                        "startStation": "NDPM",
                        "endStation": "ODG",
                        "startTime": now.isoformat(),
                        "durationSeconds": duration_seconds,
                        "severity": _get_disruption_severity(disruption_name, category),
                        "status": "active",
                        "category": category
                    }
                    
                    # Add impact data if available
                    if disruption_impact:
                        signal_disruption.update({
                            "passenger_delay_minutes": disruption_impact.get("base_delay_minutes", {}).get("passenger", 0),
                            "freight_delay_minutes": disruption_impact.get("base_delay_minutes", {}).get("freight", 0),
                            "throughput_drop_percent": disruption_impact.get("throughput_drop_percent", 0),
                            "speed_reduction_factor": disruption_impact.get("speed_reduction", 0.0),
                            "complete_block": disruption_impact.get("complete_block", False),
                            "requires_ta912": disruption_impact.get("requires_ta912", False),
                            "recovery_time_minutes": disruption_impact.get("recovery_time_minutes", 0),
                            "operational_effects": disruption_impact.get("operational_effects", {})  # Include operational effects
                        })
                    
                    generated_disruptions.append(signal_disruption)
                
                # Track block example
                if track_blocks:
                    track_item = track_blocks[0]
                    disruption_name = track_item.get("disruption", "")
                    category = track_item.get("category", "")
                    
                    # Get impact data
                    category_impacts = impact_data.get(category, {})
                    disruption_impact = category_impacts.get(disruption_name, {})
                    
                    # Use impact data for duration and delay
                    base_delay = disruption_impact.get("base_delay_minutes", {}).get("passenger", 20)
                    recovery_time = disruption_impact.get("recovery_time_minutes", 90)
                    duration_seconds = max(2400, recovery_time * 60)  # At least 40 min or recovery time
                    
                    track_disruption = {
                        "id": "d2",
                        "type": _map_disruption_type_to_system_type(disruption_name, category),
                        "description": f"{disruption_name} - {category}",
                        "sectionId": "ODG-MDDP",
                        "startStation": "ODG",
                        "endStation": "MDDP",
                        "startTime": (now + timedelta(minutes=10)).isoformat(),
                        "durationSeconds": duration_seconds,
                        "severity": _get_disruption_severity(disruption_name, category),
                        "status": "active",
                        "category": category
                    }
                    
                    # Add impact data if available
                    if disruption_impact:
                        track_disruption.update({
                            "passenger_delay_minutes": disruption_impact.get("base_delay_minutes", {}).get("passenger", 0),
                            "freight_delay_minutes": disruption_impact.get("base_delay_minutes", {}).get("freight", 0),
                            "throughput_drop_percent": disruption_impact.get("throughput_drop_percent", 0),
                            "speed_reduction_factor": disruption_impact.get("speed_reduction", 0.0),
                            "complete_block": disruption_impact.get("complete_block", False),
                            "requires_ta912": disruption_impact.get("requires_ta912", False),
                            "recovery_time_minutes": disruption_impact.get("recovery_time_minutes", 0),
                            "operational_effects": disruption_impact.get("operational_effects", {})  # Include operational effects
                        })
                    
                    generated_disruptions.append(track_disruption)
                
                if generated_disruptions:
                    disruptions_list = generated_disruptions
        
        # Original fallback if no catalog-based disruptions
        if division_lower == "itarsi_bhopal" and len(disruptions_list) == 0:
            from datetime import datetime, timezone, timedelta
            now = datetime.now(timezone.utc)
            
            # Load section data for impact calculations
            sections_df = dataset.get("sections")
            section_data_map = {}
            if sections_df is not None and not sections_df.empty:
                for section in sections_df.to_dict('records'):
                    section_id = str(section.get("section_id", ""))
                    if section_id:
                        section_data_map[section_id] = section
            
            # Sample disruption: Signal failure between NDPM and ODG (Realistic Example)
            ndpm_odg_section = section_data_map.get("NDPM-ODG", {})
            signal_failure_disruption = {
                "id": "d1",
                "type": "signal_failure",
                "description": "Signal Failure – Down Line, Narmadapuram–Obaidullaganj Section. Fail-safe mode activated.",
                "sectionId": "NDPM-ODG",
                "startStation": "NDPM",
                "endStation": "ODG",
                "startTime": now.isoformat(),
                "durationSeconds": 1800,  # 30 minutes
                "severity": "high",
                "status": "active"
            }
            
            # Get operational effects from mapping for signal failure
            impact_mapping = _load_disruption_impact_mapping()
            impact_data_map = impact_mapping.get("disruption_impacts", {})
            for cat_name, category_impacts in impact_data_map.items():
                for disruption_name, impact_info in category_impacts.items():
                    if "signal failure" in disruption_name.lower() and "red lamp" in disruption_name.lower():
                        signal_failure_disruption["operational_effects"] = impact_info.get("operational_effects", {})
                        break
                if signal_failure_disruption.get("operational_effects"):
                    break
            
            # Calculate detailed operational impact
            impact_data = _calculate_signal_failure_impact(signal_failure_disruption, ndpm_odg_section)
            signal_failure_disruption.update(impact_data)
            
            # Get operational effects for track block
            track_block_disruption = {
                    "id": "d2",
                    "type": "track_block",
                    "description": "Track maintenance block between ODG and MDDP",
                    "sectionId": "ODG-MDDP",
                    "startStation": "ODG",
                    "endStation": "MDDP",
                    "startTime": (now + timedelta(minutes=10)).isoformat(),
                    "durationSeconds": 2400,  # 40 minutes
                    "severity": "medium",
                    "status": "active"
                }
            
            # Get operational effects from mapping for track maintenance
            for cat_name, category_impacts in impact_data_map.items():
                for disruption_name, impact_info in category_impacts.items():
                    if "track maintenance" in disruption_name.lower() or "engineering work" in disruption_name.lower():
                        track_block_disruption["operational_effects"] = impact_info.get("operational_effects", {})
                        break
                if track_block_disruption.get("operational_effects"):
                    break
            
            disruptions_list = [
                signal_failure_disruption,
                track_block_disruption
            ]
        
        # Calculate operational impacts for all disruptions
        sections_df = dataset.get("sections")
        section_data_map = {}
        if sections_df is not None and not sections_df.empty:
            for section in sections_df.to_dict('records'):
                section_id = str(section.get("section_id", ""))
                if section_id:
                    section_data_map[section_id] = section
        
        # Enhance disruptions with operational impact data
        enhanced_disruptions = []
        impact_mapping = _load_disruption_impact_mapping()
        impact_data_map = impact_mapping.get("disruption_impacts", {})
        
        for disruption in disruptions_list:
            # Try to get impact data from mapping first
            category = disruption.get("category")
            description = disruption.get("description", "")
            disruption_type = disruption.get("type", "")
            matched = False
            
            if category and description:
                # Try to match disruption name from description
                category_impacts = impact_data_map.get(category, {})
                for disruption_name, impact_info in category_impacts.items():
                    if disruption_name.lower() in description.lower():
                        # Found matching impact data
                        disruption.update({
                            "passenger_delay_minutes": impact_info.get("base_delay_minutes", {}).get("passenger", 0),
                            "freight_delay_minutes": impact_info.get("base_delay_minutes", {}).get("freight", 0),
                            "throughput_drop_percent": impact_info.get("throughput_drop_percent", 0),
                            "speed_reduction_factor": impact_info.get("speed_reduction", 0.0),
                            "complete_block": impact_info.get("complete_block", False),
                            "requires_ta912": impact_info.get("requires_ta912", False),
                            "recovery_time_minutes": impact_info.get("recovery_time_minutes", 0),
                            "operational_effects": impact_info.get("operational_effects", {})  # Include operational effects
                        })
                        matched = True
                        break
            
            # If no match by category, try to match by disruption type across all categories
            if not matched and disruption_type:
                for cat_name, category_impacts in impact_data_map.items():
                    for disruption_name, impact_info in category_impacts.items():
                        # Match by type (e.g., "signal_failure" matches "Signal failure")
                        mapped_type = _map_disruption_type_to_system_type(disruption_name, cat_name)
                        if mapped_type == disruption_type:
                            # Found matching impact data by type
                            disruption.update({
                                "passenger_delay_minutes": impact_info.get("base_delay_minutes", {}).get("passenger", 0),
                                "freight_delay_minutes": impact_info.get("base_delay_minutes", {}).get("freight", 0),
                                "throughput_drop_percent": impact_info.get("throughput_drop_percent", 0),
                                "speed_reduction_factor": impact_info.get("speed_reduction", 0.0),
                                "complete_block": impact_info.get("complete_block", False),
                                "requires_ta912": impact_info.get("requires_ta912", False),
                                "recovery_time_minutes": impact_info.get("recovery_time_minutes", 0),
                                "operational_effects": impact_info.get("operational_effects", {})  # Include operational effects
                            })
                            matched = True
                            break
                    if matched:
                        break
            
            # Final fallback: try to match by keywords in description
            if not matched and description:
                description_lower = description.lower()
                for cat_name, category_impacts in impact_data_map.items():
                    for disruption_name, impact_info in category_impacts.items():
                        disruption_name_lower = disruption_name.lower()
                        # Check if key terms from disruption name appear in description
                        key_terms = disruption_name_lower.split()
                        if len(key_terms) > 0:
                            # Match if at least 2 key terms appear in description
                            matches = sum(1 for term in key_terms if len(term) > 3 and term in description_lower)
                            if matches >= 2:
                                disruption.update({
                                    "passenger_delay_minutes": impact_info.get("base_delay_minutes", {}).get("passenger", 0),
                                    "freight_delay_minutes": impact_info.get("base_delay_minutes", {}).get("freight", 0),
                                    "throughput_drop_percent": impact_info.get("throughput_drop_percent", 0),
                                    "speed_reduction_factor": impact_info.get("speed_reduction", 0.0),
                                    "complete_block": impact_info.get("complete_block", False),
                                    "requires_ta912": impact_info.get("requires_ta912", False),
                                    "recovery_time_minutes": impact_info.get("recovery_time_minutes", 0),
                                    "operational_effects": impact_info.get("operational_effects", {})  # Include operational effects
                                })
                                matched = True
                                break
                    if matched:
                        break
            
            # For signal failures, also calculate detailed operational impact
            if disruption.get("type") == "signal_failure" and disruption.get("status") == "active":
                section_id = disruption.get("sectionId")
                section_data = section_data_map.get(section_id, {})
                signal_impact = _calculate_signal_failure_impact(disruption, section_data)
                # Merge signal failure specific calculations (don't overwrite operational_effects if already set)
                if "operational_effects" not in disruption or not disruption.get("operational_effects"):
                    # If no operational_effects from mapping, try to get from signal failure mapping
                    for cat_name, category_impacts in impact_data_map.items():
                        for disruption_name, impact_info in category_impacts.items():
                            if "signal failure" in disruption_name.lower():
                                disruption["operational_effects"] = impact_info.get("operational_effects", {})
                                break
                        if disruption.get("operational_effects"):
                            break
                disruption.update(signal_impact)
            
            enhanced_disruptions.append(disruption)
        
        disruptions_list = enhanced_disruptions
        
        result = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "disruptions": disruptions_list
        }
        
        return result
        
    except ValueError as e:
        logger.error(f"Invalid division for disruptions {division}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get disruptions for division {division}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get disruptions: {str(e)}")


@router.get("/disruption-catalog")
def get_disruption_catalog() -> Dict[str, Any]:
    """
    Get disruption catalog from railway_disruptions.csv with impact data.
    Returns all available disruption types organized by category with delay impacts.
    """
    try:
        catalog = _load_disruption_catalog()
        impact_mapping = _load_disruption_impact_mapping()
        impact_data = impact_mapping.get("disruption_impacts", {})
        
        # Organize by category
        by_category = defaultdict(list)
        for item in catalog:
            category = item.get("category", "Unknown")
            disruption = item.get("disruption", "")
            if category and disruption:
                # Get impact data for this disruption
                category_impacts = impact_data.get(category, {})
                disruption_impact = category_impacts.get(disruption, {})
                
                disruption_info = {
                    "name": disruption,
                    "type": _map_disruption_type_to_system_type(disruption, category),
                    "severity": _get_disruption_severity(disruption, category),
                    "category": category
                }
                
                # Add impact data if available
                if disruption_impact:
                    disruption_info["impact"] = {
                        "passenger_delay_minutes": disruption_impact.get("base_delay_minutes", {}).get("passenger", 0),
                        "freight_delay_minutes": disruption_impact.get("base_delay_minutes", {}).get("freight", 0),
                        "throughput_drop_percent": disruption_impact.get("throughput_drop_percent", 0),
                        "speed_reduction_factor": disruption_impact.get("speed_reduction", 0.0),
                        "complete_block": disruption_impact.get("complete_block", False),
                        "requires_ta912": disruption_impact.get("requires_ta912", False),
                        "recovery_time_minutes": disruption_impact.get("recovery_time_minutes", 0),
                        "tsr_speed_kmph": disruption_impact.get("tsr_speed_kmph")
                    }
                else:
                    # Use default impact calculation
                    impact_info = _get_disruption_impact_data(disruption, category)
                    disruption_info["impact"] = {
                        "passenger_delay_minutes": impact_info.get("base_delay_minutes", {}).get("passenger", 0),
                        "freight_delay_minutes": impact_info.get("base_delay_minutes", {}).get("freight", 0),
                        "throughput_drop_percent": impact_info.get("throughput_drop_percent", 0),
                        "speed_reduction_factor": impact_info.get("speed_reduction", 0.0)
                    }
                
                by_category[category].append(disruption_info)
        
        # Convert to list format
        categories_list = [
            {
                "category": category,
                "disruptions": disruptions,
                "count": len(disruptions)
            }
            for category, disruptions in by_category.items()
        ]
        
        return {
            "categories": categories_list,
            "total_types": len(catalog),
            "total_categories": len(categories_list)
        }
        
    except Exception as e:
        logger.error(f"Failed to load disruption catalog: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load disruption catalog: {str(e)}")


@router.get("/{division}/scenarios")
def get_digital_twin_scenarios(division: str = PathParam(..., description="Division name (e.g., mumbai, pune)")) -> Dict[str, Any]:
    """
    Get what-if scenarios for smart train prioritization.
    
    Returns:
    {
        "scenarios": [
            {
                "id": "scenario_1",
                "name": "Signal Failure - Peak Hour Rush",
                "description": "...",
                "type": "signal_failure",
                "severity": "high",
                "disruptions": [...],
                "trains": {"passenger": 15, "freight": 8},
                "timeWindow": "08:00-10:00",
                "expectedImpact": {...},
                "prioritizationRules": [...]
            },
            ...
        ]
    }
    """
    try:
        division_lower = division.lower().strip().replace("-", "_")
        
        # Load scenarios from JSON file
        data_path = Path(__file__).resolve().parents[2] / "data" / division_lower / "scenarios.json"
        
        if data_path.exists():
            with open(data_path, 'r', encoding='utf-8') as f:
                scenarios_data = json.load(f)
                return scenarios_data
        else:
            # Return empty scenarios if file doesn't exist
            logger.warning(f"Scenarios file not found for {division_lower}")
            return {
                "scenarios": [],
                "metadata": {
                    "division": division_lower,
                    "message": "No scenarios available"
                }
            }
            
    except Exception as e:
        logger.error(f"Failed to load scenarios for division {division}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load scenarios: {str(e)}")


@router.post("/{division}/scenarios/{scenario_id}/apply")
async def apply_scenario(
    division: str = PathParam(..., description="Division name"),
    scenario_id: str = PathParam(..., description="Scenario ID to apply")
) -> Dict[str, Any]:
    """
    Apply a what-if scenario to the digital twin.
    This will inject disruptions and adjust train priorities according to the scenario.
    """
    try:
        division_lower = division.lower().strip().replace("-", "_")
        
        # Load scenarios
        data_path = Path(__file__).resolve().parents[2] / "data" / division_lower / "scenarios.json"
        
        if not data_path.exists():
            raise HTTPException(status_code=404, detail="Scenarios file not found")
        
        with open(data_path, 'r', encoding='utf-8') as f:
            scenarios_data = json.load(f)
        
        # Find the scenario
        scenario = None
        for s in scenarios_data.get("scenarios", []):
            if s.get("id") == scenario_id:
                scenario = s
                break
        
        if not scenario:
            raise HTTPException(status_code=404, detail=f"Scenario {scenario_id} not found")
        
        # Apply disruptions from scenario
        applied_disruptions = []
        for disruption in scenario.get("disruptions", []):
            # Convert scenario disruption to API format
            from datetime import datetime, timezone, timedelta
            
            start_time = datetime.now(timezone.utc)
            duration_seconds = disruption.get("durationMinutes", 0) * 60
            
            applied_disruption = {
                "id": f"{scenario_id}_{disruption.get('type')}_{len(applied_disruptions)}",
                "type": disruption.get("type"),
                "description": f"{scenario.get('name')} - {disruption.get('type')}",
                "sectionId": disruption.get("sectionId"),
                "startStation": disruption.get("startStation"),
                "endStation": disruption.get("endStation"),
                "startTime": start_time.isoformat(),
                "durationSeconds": duration_seconds,
                "severity": disruption.get("severity", "medium"),
                "status": "active"
            }
            
            # Add operational impact for signal failures
            if disruption.get("type") == "signal_failure":
                section_data = {}
                # Try to get section data
                try:
                    dataset = load_division_dataset(division_lower)
                    sections_df = dataset.get("sections")
                    if sections_df is not None and not sections_df.empty:
                        for section in sections_df.to_dict('records'):
                            if str(section.get("section_id", "")) == disruption.get("sectionId"):
                                section_data = section
                                break
                except Exception:
                    pass
                
                impact_data = _calculate_signal_failure_impact(applied_disruption, section_data)
                applied_disruption.update(impact_data)
            
            applied_disruptions.append(applied_disruption)
        
        return {
            "success": True,
            "scenario": scenario,
            "applied_disruptions": applied_disruptions,
            "message": f"Scenario '{scenario.get('name')}' applied successfully",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to apply scenario {scenario_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to apply scenario: {str(e)}")


@router.get("/{division}/schedule")
def get_digital_twin_schedule(division: str = PathParam(..., description="Division name (e.g., mumbai, pune)")) -> Dict[str, Any]:
    """
    Get train schedules for Gantt chart visualization.
    
    Returns schedule data with arrival/departure times for each train at each station.
    """
    try:
        division_lower = division.lower().strip().replace("-", "_")
        
        # Load division dataset
        dataset = load_division_dataset(division_lower)
        trains_df = dataset.get("trains")
        stations_df = dataset.get("stations")
        
        if trains_df is None or trains_df.empty:
            return {"trains": []}
        
        stations_list = normalize_stations(stations_df) if stations_df is not None and not stations_df.empty else []
        station_map = {str(s.get("code", "")): s for s in stations_list}
        
        # Parse train schedules from trains.csv
        trains_list = trains_df.to_dict('records')
        schedule_data = []
        
        for train in trains_list:
            # Handle both train_id and train_no columns
            train_no = str(train.get("train_id", "") or train.get("train_no", ""))
            train_name = str(train.get("name", "") or train.get("train_name", ""))
            
            # Handle route - could be route column or from_station_id/to_station_id
            route_str = str(train.get("route", ""))
            from_station_id = str(train.get("from_station_id", "") or train.get("from_station", ""))
            to_station_id = str(train.get("to_station_id", "") or train.get("to_station", ""))
            
            departure_time_str = str(train.get("departure", ""))
            arrival_time_str = str(train.get("arrival", ""))
            
            if not train_no:
                continue
            
            # Build route from available data
            if route_str and route_str.strip():
                route = [s.strip().upper() for s in route_str.split(',') if s.strip()]
            elif from_station_id and to_station_id:
                route = [from_station_id.strip().upper(), to_station_id.strip().upper()]
            else:
                continue
            
            if len(route) < 2:
                continue
            
            # Parse times (format: HH:MM)
            from_station = route[0]
            to_station = route[-1]
            
            # Create schedule entries
            arrivals = []
            departures = []
            
            # Parse departure and arrival times
            try:
                today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                
                if departure_time_str and ':' in departure_time_str:
                    dep_parts = departure_time_str.split(':')
                    if len(dep_parts) >= 2:
                        dep_hour = int(dep_parts[0])
                        dep_min = int(dep_parts[1])
                        dep_time = today.replace(hour=dep_hour, minute=dep_min)
                        departures.append({
                            "station": from_station,
                            "time": dep_time,
                            "delay": 0
                        })
                
                if arrival_time_str and ':' in arrival_time_str:
                    arr_parts = arrival_time_str.split(':')
                    if len(arr_parts) >= 2:
                        arr_hour = int(arr_parts[0])
                        arr_min = int(arr_parts[1])
                        # Handle next day arrivals
                        arr_time = today.replace(hour=arr_hour, minute=arr_min)
                        # Check if arrival is before departure (next day)
                        if departures and arr_time < departures[0]["time"]:
                            arr_time = arr_time.replace(day=arr_time.day + 1)
                        elif not departures and arr_time < today:
                            arr_time = arr_time.replace(day=arr_time.day + 1)
                        arrivals.append({
                            "station": to_station,
                            "time": arr_time,
                            "delay": 0
                        })
            except Exception as e:
                logger.debug(f"Failed to parse times for train {train_no}: {e}")
                continue
            
            schedule_data.append({
                "trainNo": train_no,
                "trainName": train_name,
                "route": route,
                "arrivals": arrivals,
                "departures": departures
            })
        
        return {
            "division": division_lower,
            "trains": schedule_data
        }
        
    except Exception as e:
        logger.error(f"Failed to get schedule for division {division}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get schedule: {str(e)}")


@router.get("/india/map")
def get_india_railway_map() -> Dict[str, Any]:
    """
    Get aggregated map data for all divisions (India railway network).
    
    Returns:
    {
        "stations": [
            {
                "stationCode": "MMCT",
                "stationName": "Mumbai Central",
                "lat": 19.0760,
                "lon": 72.8777,
                "division": "mumbai",
                "isJunction": false
            },
            ...
        ],
        "sections": [
            {
                "section_id": "MUM_S1",
                "from": "MMCT",
                "to": "DR",
                "division": "mumbai",
                "isTrunk": true
            },
            ...
        ]
    }
    """
    try:
        logger.info("Starting India railway map data aggregation...")
        VALID_DIVISIONS = ["mumbai", "pune", "bhusaval", "nagpur", "solapur", "itarsi_bhopal"]
        
        all_stations = []
        all_sections = []
        station_codes_seen = set()
        
        for division in VALID_DIVISIONS:
            try:
                dataset = load_division_dataset(division)
                
                # Get stations
                stations_df = dataset.get("stations")
                stations_list = normalize_stations(stations_df) if stations_df is not None and not stations_df.empty else []
                
                # Get sections
                sections_df = dataset.get("sections")
                sections_list = normalize_sections(sections_df) if sections_df is not None and not sections_df.empty else []
                
                # Add stations (avoid duplicates by station code)
                for station in stations_list:
                    station_code = str(station.get("code", "")).upper()
                    if station_code and station_code not in station_codes_seen:
                        all_stations.append({
                            "stationCode": station_code,
                            "stationName": str(station.get("name", "")),
                            "lat": float(station.get("lat", 0.0)),
                            "lon": float(station.get("lon", 0.0)),
                            "division": division,
                            "isJunction": bool(station.get("is_junction", False))
                        })
                        station_codes_seen.add(station_code)
                
                # Add sections
                for section in sections_list:
                    from_station = str(section.get("from_station", "")).upper()
                    to_station = str(section.get("to_station", "")).upper()
                    
                    # Determine if trunk route (based on distance or other criteria)
                    distance_km = float(section.get("distance_km", 0.0))
                    is_trunk = distance_km > 50.0  # Trunk routes are typically longer
                    
                    all_sections.append({
                        "section_id": str(section.get("section_id", "")),
                        "from": from_station,
                        "to": to_station,
                        "division": division,
                        "isTrunk": is_trunk,
                        "distanceKm": distance_km
                    })
                    
            except Exception as e:
                logger.warning(f"Failed to load data for division {division}: {e}")
                continue
        
        result = {
            "stations": all_stations,
            "sections": all_sections
        }
        
        logger.info(f"Returning India map data: {len(all_stations)} stations, {len(all_sections)} sections")
        
        # Ensure we return at least empty arrays if no data
        if not all_stations:
            logger.warning("No stations found in any division - returning empty result")
        if not all_sections:
            logger.warning("No sections found in any division - returning empty result")
            
        return result
        
    except Exception as e:
        logger.error(f"Failed to load India map data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to load India map data: {str(e)}")


@router.get("/india/positions")
async def get_india_railway_positions() -> Dict[str, Any]:
    """
    Get live train positions for all divisions (India railway network).
    
    Returns aggregated positions from all divisions.
    """
    try:
        VALID_DIVISIONS = ["mumbai", "pune", "bhusaval", "nagpur", "solapur", "itarsi_bhopal"]
        
        all_trains = []
        
        for division in VALID_DIVISIONS:
            try:
                # Load division dataset to get sections
                dataset = load_division_dataset(division)
                sections_df = dataset.get("sections")
                
                # Build sections list for position calculation
                sections_list = []
                if sections_df is not None and not sections_df.empty:
                    try:
                        sections_list = sections_df.to_dict('records')
                    except Exception as e:
                        logger.warning(f"Failed to build section map for {division}: {e}")
                
                # Try to get merged live trains
                try:
                    from app.services.train_merger import get_merged_live_trains
                    merged_data = await get_merged_live_trains(division)
                    
                    for train_data in merged_data.get("trains", []):
                        train_id = str(train_data.get("id", "") or train_data.get("train_id", "") or train_data.get("train_no", ""))
                        if not train_id:
                            continue
                        
                        # Find section based on position_km
                        position_km = train_data.get("position_km", 0.0)
                        section_id = None
                        progress = 0.0
                        
                        if sections_list and position_km > 0:
                            cumulative_km = 0.0
                            for section in sections_list:
                                section_dist = float(section.get("distance_km", 0.0))
                                if cumulative_km <= position_km <= cumulative_km + section_dist:
                                    section_id = str(section.get("section_id", ""))
                                    progress = (position_km - cumulative_km) / section_dist if section_dist > 0 else 0.0
                                    break
                                cumulative_km += section_dist
                        
                        if not section_id and sections_list:
                            first_section = sections_list[0]
                            section_id = str(first_section.get("section_id", ""))
                            progress = 0.0
                        
                        speed_val = train_data.get("speed")
                        speed = float(speed_val) if speed_val is not None else 0.0
                        
                        delay_val = train_data.get("delay_minutes", 0)
                        delay = int(delay_val) if delay_val is not None else 0
                        
                        train_info = {
                            "trainNo": train_id,
                            "trainName": train_data.get("name", ""),
                            "trainType": train_data.get("type", "EXPRESS"),
                            "position": {
                                "sectionId": section_id or "",
                                "progress": max(0.0, min(1.0, progress))
                            },
                            "speed": speed,
                            "status": "RUNNING" if speed > 0 else "STOPPED",
                            "delay": delay,
                            "division": division
                        }
                        all_trains.append(train_info)
                        
                except Exception as e:
                    logger.warning(f"Failed to get merged live trains for {division}: {e}")
                    continue
                    
            except Exception as e:
                logger.warning(f"Failed to process division {division}: {e}")
                continue
        
        result = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "trains": all_trains
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Failed to get India positions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get India positions: {str(e)}")