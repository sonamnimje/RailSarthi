"""
Digital Twin API routes for map and position data.
"""
from fastapi import APIRouter, HTTPException, Path
from typing import Dict, Any, List
import logging
from datetime import datetime

from app.services.division_loader import load_division_dataset, normalize_stations, normalize_sections

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/{division}/map")
def get_digital_twin_map(division: str = Path(..., description="Division name (e.g., mumbai, pune)")) -> Dict[str, Any]:
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
        division_lower = division.lower().strip()
        
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
async def get_digital_twin_positions(division: str = Path(..., description="Division name (e.g., mumbai, pune)")) -> Dict[str, Any]:
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
        division_lower = division.lower().strip()
        
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
                if sections_list and position_km > 0:
                    cumulative_km = 0.0
                    for section in sections_list:
                        section_dist = float(section.get("distance_km", 0.0))
                        if cumulative_km <= position_km <= cumulative_km + section_dist:
                            section_id = str(section.get("section_id", ""))
                            progress = (position_km - cumulative_km) / section_dist if section_dist > 0 else 0.0
                            break
                        cumulative_km += section_dist
                
                # Default to first section if not found
                if not section_id and sections_list:
                    first_section = sections_list[0]
                    section_id = str(first_section.get("section_id", ""))
                    progress = 0.0
                
                # Safely convert speed and delay, handling None values
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
                    "delay": delay
                }
                trains.append(train_info)
            
            result = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "trains": trains
            }
            
            return result
            
        except Exception as e:
            logger.warning(f"Failed to get merged live trains, returning empty list: {e}")
            # Fallback to empty list
            result = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "trains": []
            }
            return result
        
    except ValueError as e:
        logger.error(f"Invalid division for positions {division}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get positions for division {division}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get positions: {str(e)}")


@router.get("/{division}/schedule")
def get_digital_twin_schedule(division: str = Path(..., description="Division name (e.g., mumbai, pune)")) -> Dict[str, Any]:
    """
    Get train schedules for Gantt chart visualization.
    
    Returns schedule data with arrival/departure times for each train at each station.
    """
    try:
        division_lower = division.lower().strip()
        
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
        VALID_DIVISIONS = ["mumbai", "pune", "bhusaval", "nagpur", "solapur"]
        
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
        VALID_DIVISIONS = ["mumbai", "pune", "bhusaval", "nagpur", "solapur"]
        
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