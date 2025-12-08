"""
Dataset loader for Indian Railway Digital Twin Simulation.
Loads all CSV files from data/ (combined) or data/solapur/ (solapur dataset).
"""
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional, List
import json
import logging

logger = logging.getLogger(__name__)

# Base data directory
BASE_DIR = Path(__file__).resolve().parents[1]  # backend/app/services -> backend/app
DATA_DIR = BASE_DIR / "data"


def load_dataset(dataset: str = "combined") -> Dict[str, Any]:
    """
    Load all datasets for the specified dataset mode.
    
    Args:
        dataset: "combined" (root data/) or "solapur" (data/solapur/)
    
    Returns:
        Dictionary with all loaded dataframes and normalized structures
    """
    if dataset == "solapur":
        data_path = DATA_DIR / "solapur"
        prefix = "solapur_"
    else:
        data_path = DATA_DIR
        prefix = ""
    
    result = {
        "dataset": dataset,
        "stations": None,
        "sections": None,
        "trains": None,
        "speed_restrictions": None,
        "curves": None,
        "bridges": None,
        "electrification": None,
        "loco_specs": None,
        "disruptions": None,
    }
    
    # Load stations - try multiple possible names
    stations_file = data_path / f"{prefix}stations.csv"
    if not stations_file.exists():
        # Try alternative names
        alt_names = ["stations (1).csv", "station.csv"]
        for alt in alt_names:
            alt_path = data_path / alt
            if alt_path.exists():
                stations_file = alt_path
                break
    
    if stations_file.exists():
        df = pd.read_csv(stations_file)
        # Normalize column names
        if "station_code" in df.columns:
            df = df.rename(columns={"station_code": "code"})
        if "station_name" in df.columns:
            df = df.rename(columns={"station_name": "name"})
        result["stations"] = df
        logger.info(f"Loaded {len(df)} stations from {stations_file.name}")
    else:
        logger.warning(f"Stations file not found: {stations_file}")
        result["stations"] = pd.DataFrame(columns=["code", "name", "latitude", "longitude", "division"])
    
    # Load sections
    sections_file = data_path / f"{prefix}sections.csv"
    if sections_file.exists():
        df = pd.read_csv(sections_file)
        result["sections"] = df
        logger.info(f"Loaded {len(df)} sections from {sections_file.name}")
    else:
        logger.warning(f"Sections file not found: {sections_file}")
        result["sections"] = pd.DataFrame(columns=["section_id", "from_station", "to_station", "distance_km", "tracks", "electrified", "max_speed_kmph"])
    
    # Load trains
    trains_file = data_path / f"{prefix}trains.csv"
    if trains_file.exists():
        df = pd.read_csv(trains_file)
        result["trains"] = df
        logger.info(f"Loaded {len(df)} trains from {trains_file.name}")
    else:
        logger.warning(f"Trains file not found: {trains_file}")
        result["trains"] = pd.DataFrame(columns=["trainNo", "name", "type", "route", "max_speed_kmph", "schedule"])
    
    # Load speed restrictions
    restrictions_file = data_path / f"{prefix}speed_restrictions.csv"
    if restrictions_file.exists():
        result["speed_restrictions"] = pd.read_csv(restrictions_file)
        logger.info(f"Loaded speed restrictions from {restrictions_file.name}")
    else:
        # Try alternative names
        alt_files = ["restrictions.csv", "speed_limits.csv"]
        for alt in alt_files:
            alt_path = data_path / alt
            if alt_path.exists():
                result["speed_restrictions"] = pd.read_csv(alt_path)
                logger.info(f"Loaded speed restrictions from {alt}")
                break
        else:
            result["speed_restrictions"] = pd.DataFrame(columns=["section_id", "restriction_kmph"])
            logger.warning("Speed restrictions file not found, using empty dataframe")
    
    # Load curves (may be named curves_gradients or curves)
    curves_file = data_path / f"{prefix}curves_gradients.csv"
    if not curves_file.exists():
        curves_file = data_path / f"{prefix}curves.csv"
    if curves_file.exists():
        result["curves"] = pd.read_csv(curves_file)
        logger.info(f"Loaded curves from {curves_file.name}")
    else:
        result["curves"] = pd.DataFrame(columns=["section_id", "max_curve_degree", "ruling_gradient"])
        logger.warning("Curves file not found, using empty dataframe")
    
    # Load bridges
    bridges_file = data_path / f"{prefix}bridges.csv"
    if bridges_file.exists():
        result["bridges"] = pd.read_csv(bridges_file)
        logger.info(f"Loaded bridges from {bridges_file.name}")
    else:
        result["bridges"] = pd.DataFrame(columns=["section_id", "type", "length_m"])
        logger.warning("Bridges file not found, using empty dataframe")
    
    # Load electrification
    electrification_file = data_path / f"{prefix}electrification.csv"
    if not electrification_file.exists():
        # Electrification may be in sections.csv, check there
        if result["sections"] is not None and "electrified" in result["sections"].columns:
            result["electrification"] = result["sections"][["section_id", "electrified"]].copy()
            logger.info("Using electrification from sections.csv")
        else:
            result["electrification"] = pd.DataFrame(columns=["section_id", "electrified"])
            logger.warning("Electrification data not found")
    else:
        result["electrification"] = pd.read_csv(electrification_file)
        logger.info(f"Loaded electrification from {electrification_file.name}")
    
    # Load loco specs
    loco_file = data_path / f"{prefix}loco_specs.csv"
    if not loco_file.exists():
        # Try alternative names
        alt_files = ["rolling_stock.csv", "locomotives.csv"]
        for alt in alt_files:
            alt_path = data_path / alt
            if alt_path.exists():
                result["loco_specs"] = pd.read_csv(alt_path)
                logger.info(f"Loaded loco specs from {alt}")
                break
        else:
            result["loco_specs"] = pd.DataFrame(columns=["type", "max_speed_kmph", "power_kw"])
            logger.warning("Loco specs file not found, using defaults")
    else:
        result["loco_specs"] = pd.read_csv(loco_file)
        logger.info(f"Loaded loco specs from {loco_file.name}")
    
    # Load disruptions
    disruptions_file = data_path / f"{prefix}disruptions.csv"
    if disruptions_file.exists():
        result["disruptions"] = pd.read_csv(disruptions_file)
        logger.info(f"Loaded disruptions from {disruptions_file.name}")
    else:
        result["disruptions"] = pd.DataFrame(columns=["disruption_id", "type", "section_id", "start_time", "duration_seconds", "severity"])
        logger.warning("Disruptions file not found, using empty dataframe")
    
    return result


def normalize_stations(stations_df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Normalize stations dataframe to list of dicts"""
    if stations_df.empty:
        return []
    
    stations = []
    for _, row in stations_df.iterrows():
        station = {
            "code": str(row.get("code", row.get("station_code", ""))),
            "name": str(row.get("name", row.get("station_name", ""))),
            "lat": float(row.get("latitude", 0.0)),
            "lon": float(row.get("longitude", 0.0)),
            "division": str(row.get("division", "")),
            "is_junction": bool(row.get("is_junction", False)),
            "platforms": int(row.get("platforms", 1)),
        }
        stations.append(station)
    
    return stations


def normalize_sections(sections_df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Normalize sections dataframe to list of dicts"""
    if sections_df.empty:
        return []
    
    sections = []
    for _, row in sections_df.iterrows():
        section = {
            "section_id": str(row.get("section_id", "")),
            "from_station": str(row.get("from_station", "")),
            "to_station": str(row.get("to_station", "")),
            "distance_km": float(row.get("distance_km", 0.0)),
            "tracks": int(row.get("tracks", 1)),
            "electrified": bool(row.get("electrified", False)),
            "max_speed_kmph": float(row.get("max_speed_kmph", 100.0)),
            "line_type": str(row.get("line_type", "main")),
            "division": str(row.get("division", "")),
        }
        sections.append(section)
    
    return sections


def normalize_trains(trains_df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Normalize trains dataframe to list of dicts"""
    if trains_df.empty:
        return []
    
    trains = []
    for _, row in trains_df.iterrows():
        # Parse schedule JSON if present
        schedule_str = row.get("schedule", "{}")
        if isinstance(schedule_str, str):
            try:
                schedule = json.loads(schedule_str)
            except:
                schedule = {}
        else:
            schedule = schedule_str
        
        # Parse route
        route_str = row.get("route", "")
        if isinstance(route_str, str):
            route = [s.strip() for s in route_str.split("|") if s.strip()]
        else:
            route = []
        
        train = {
            "train_id": str(row.get("trainNo", row.get("train_id", ""))),
            "name": str(row.get("name", "")),
            "type": str(row.get("type", "Passenger")),
            "priority": int(row.get("priority", 3)),
            "route": route,
            "max_speed_kmph": float(row.get("max_speed_kmph", 100.0)),
            "schedule": schedule,
            "division": str(row.get("division", "")),
        }
        trains.append(train)
    
    return trains


# -----------------------------------------------------------------------------
# Time-distance JSON loader (Jabalpur → Itarsi section)
# -----------------------------------------------------------------------------

def _load_json_file(file_name: str, data_path: Optional[Path] = None) -> Any:
    """
    Safe JSON loader with helpful defaults.

    Args:
        file_name: Name of the JSON file to load.
        data_path: Optional custom directory path.

    Returns:
        Parsed JSON content or an empty list/dict on failure.
    """
    target_dir = data_path or DATA_DIR
    file_path = target_dir / file_name

    if not file_path.exists():
        logger.warning(f"JSON dataset not found: {file_path}")
        return [] if file_name.endswith(".json") else {}

    try:
        with file_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logger.error(f"Failed to load {file_path}: {exc}")
        return [] if file_name.endswith(".json") else {}


def load_time_distance_json(data_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Load the Jabalpur → Itarsi time-distance dataset from JSON files.

    Args:
        data_path: Optional override for the data directory (defaults to app/data).

    Returns:
        Dictionary with stations, blocks, signals, trains, and timetable entries.
    """
    target_dir = data_path or DATA_DIR
    datasets = {
        "stations": _load_json_file("stations.json", target_dir),
        "blocks": _load_json_file("blocks.json", target_dir),
        "signals": _load_json_file("signals.json", target_dir),
        "trains": _load_json_file("trains.json", target_dir),
        "timetable": _load_json_file("timetable.json", target_dir),
    }

    logger.info(
        "Loaded time-distance dataset: %s stations, %s blocks, %s signals, %s trains, %s timetable rows",
        len(datasets["stations"]),
        len(datasets["blocks"]),
        len(datasets["signals"]),
        len(datasets["trains"]),
        len(datasets["timetable"]),
    )
    return datasets


def load_time_distance_frames(data_path: Optional[Path] = None) -> Dict[str, pd.DataFrame]:
    """
    Convenience wrapper to load the JSON dataset as pandas DataFrames.

    Args:
        data_path: Optional data directory override.

    Returns:
        Dictionary of pandas DataFrames keyed by dataset name.
    """
    raw = load_time_distance_json(data_path)
    return {
        "stations": pd.DataFrame(raw.get("stations", [])),
        "blocks": pd.DataFrame(raw.get("blocks", [])),
        "signals": pd.DataFrame(raw.get("signals", [])),
        "trains": pd.DataFrame(raw.get("trains", [])),
        "timetable": pd.DataFrame(raw.get("timetable", [])),
    }
