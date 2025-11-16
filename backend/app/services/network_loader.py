"""
Network loader for railway stations and sections.
Loads data from CSV files and provides structured access.
"""
import pandas as pd
from pathlib import Path
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

# Base data directory
BASE_DIR = Path(__file__).resolve().parents[1]  # backend/app/services -> backend/app
DATA_DIR = BASE_DIR / "data"


def load_stations(division: Optional[str] = None) -> List[Dict[str, Any]]:
	"""
	Load all stations from CSV.
	
	Args:
		division: Optional division filter (e.g., "Mumbai", "Solapur")
	
	Returns:
		List of station dictionaries with normalized fields
	"""
	# Try multiple possible station file names
	stations_file = DATA_DIR / "stations (1).csv"
	if not stations_file.exists():
		alt_names = ["stations.csv", "station.csv"]
		for alt in alt_names:
			alt_path = DATA_DIR / alt
			if alt_path.exists():
				stations_file = alt_path
				break
	
	if not stations_file.exists():
		logger.warning(f"Stations file not found in {DATA_DIR}")
		return []
	
	df = pd.read_csv(stations_file)
	
	# Normalize column names
	column_mapping = {
		"station_id": "code",
		"station_code": "code",
		"station_name": "name",
		"latitude": "lat",
		"longitude": "lon",
		"is_junction": "is_junction"
	}
	
	for old_col, new_col in column_mapping.items():
		if old_col in df.columns and new_col not in df.columns:
			df = df.rename(columns={old_col: new_col})
	
	# Filter by division if specified
	if division and "division" in df.columns:
		df = df[df["division"].str.lower() == division.lower()]
	
	# Ensure required columns exist
	required_cols = ["code", "name", "lat", "lon"]
	for col in required_cols:
		if col not in df.columns:
			if col == "code" and "station_id" in df.columns:
				df["code"] = df["station_id"]
			elif col == "name" and "station_name" in df.columns:
				df["name"] = df["station_name"]
			elif col == "lat" and "latitude" in df.columns:
				df["lat"] = df["latitude"]
			elif col == "lon" and "longitude" in df.columns:
				df["lon"] = df["longitude"]
			else:
				logger.error(f"Missing required column: {col}")
				return []
	
	# Convert to list of dictionaries
	stations = []
	for _, row in df.iterrows():
		station = {
			"id": str(row["code"]),
			"name": str(row["name"]),
			"lat": float(row["lat"]),
			"lon": float(row["lon"]),
			"division": str(row.get("division", "")),
			"is_junction": bool(row.get("is_junction", False)),
			"category": str(row.get("category", "")),
			"state": str(row.get("state", "")),
			"platforms": int(row.get("platforms", 0))
		}
		stations.append(station)
	
	logger.info(f"Loaded {len(stations)} stations")
	return stations


def load_sections(division: Optional[str] = None) -> List[Dict[str, Any]]:
	"""
	Load all sections from CSV and merge with station coordinates.
	
	Args:
		division: Optional division filter
	
	Returns:
		List of section dictionaries with from/to coordinates
	"""
	# Load sections CSV
	sections_file = DATA_DIR / "sections.csv"
	if not sections_file.exists():
		logger.warning(f"Sections file not found: {sections_file}")
		return []
	
	df = pd.read_csv(sections_file)
	
	# Filter by division if specified
	if division and "division" in df.columns:
		df = df[df["division"].str.lower() == division.lower()]
	
	# Load stations to get coordinates
	stations = load_stations(division)
	station_map = {s["id"]: s for s in stations}
	
	# Normalize column names
	column_mapping = {
		"from_station": "from_station",
		"to_station": "to_station",
		"distance_km": "distance_km",
		"tracks": "tracks",
		"electrified": "electrified",
		"max_speed_kmph": "max_speed_kmph",
		"line_type": "line_type"
	}
	
	# Ensure required columns exist
	required_cols = ["section_id", "from_station", "to_station"]
	for col in required_cols:
		if col not in df.columns:
			logger.error(f"Missing required column: {col}")
			return []
	
	# Convert to list of dictionaries with coordinates
	sections = []
	for _, row in df.iterrows():
		from_code = str(row["from_station"])
		to_code = str(row["to_station"])
		
		from_station = station_map.get(from_code)
		to_station = station_map.get(to_code)
		
		if not from_station or not to_station:
			logger.warning(f"Missing station coordinates for section {row.get('section_id')}: {from_code} -> {to_code}")
			continue
		
		# Determine track type
		tracks = int(row.get("tracks", 1))
		track_type = "Double" if tracks >= 2 else "Single"
		
		section = {
			"id": str(row["section_id"]),
			"from": from_code,
			"to": to_code,
			"from_lat": float(from_station["lat"]),
			"from_lon": float(from_station["lon"]),
			"to_lat": float(to_station["lat"]),
			"to_lon": float(to_station["lon"]),
			"distance_km": float(row.get("distance_km", 0)),
			"tracks": tracks,
			"track_type": track_type,
			"electrified": bool(row.get("electrified", False)),
			"max_speed_kmph": float(row.get("max_speed_kmph", 100)),
			"line_type": str(row.get("line_type", "main")),
			"division": str(row.get("division", ""))
		}
		sections.append(section)
	
	logger.info(f"Loaded {len(sections)} sections")
	return sections

