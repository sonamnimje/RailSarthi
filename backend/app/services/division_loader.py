"""
Division-wise dataset loader for Indian Railway Digital Twin Simulation.

Features:
- Load division-specific files from backend/app/data/ (supports combined CSVs and per-division files)
- Robust column name normalization (case-insensitive)
- Filter combined datasets by division column when available
- Inference of division assignment when division column is missing (name heuristics + simple k-means fallback)
- Fill missing station coordinates using adjacent sections
- Normalize stations, sections and trains to canonical structures
- Validation & logging (does not crash on optional missing files; raises ValueError on critical validation failures)
"""

from pathlib import Path
from typing import Dict, Any, List, Optional
import pandas as pd
import logging
import json

logger = logging.getLogger(__name__)

# Base paths (backend/app/services -> backend/app -> backend/app/data)
BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
SOLAPUR_DIR = DATA_DIR / "solapur"

# Valid divisions
VALID_DIVISIONS = ["mumbai", "pune", "bhusaval", "nagpur", "solapur"]

# Global cache for division datasets (loaded once on startup)
_division_cache: Dict[str, Dict[str, Any]] = {}
_cache_lock = None  # Will be initialized if threading is needed

# Required files when strict loading is desired (we use robust approach so treat as recommendations)
RECOMMENDED_FILES = [
    "stations.csv",
    "sections.csv",
    "trains.csv",
]

# Column mapping examples for normalization
DEFAULT_COLUMN_MAP = {
    "code": ["code", "station_code", "station_id"],
    "name": ["name", "station_name"],
    "lat": ["lat", "latitude"],
    "lon": ["lon", "longitude", "lng"],
    "division": ["division"],
    "section_id": ["section_id", "id"],
    "from_station": ["from_station", "from", "from_station_code", "from_station_id"],
    "to_station": ["to_station", "to", "to_station_code", "to_station_id"],
    "distance_km": ["distance_km", "distance", "dist"],
    "tracks": ["tracks", "track_count", "num_tracks"],
    "electrified": ["electrified", "electrification"],
    "max_speed_kmph": ["max_speed_kmph", "max_speed", "speed_limit"],
    "train_id": ["train_id", "trainno", "train_no", "id"],
    "name": ["name", "station_name", "train_name"],  # Update name to include train_name
    "route": ["route", "route_stations"],
    "schedule": ["schedule"],
}


def _path_for(data_dir: Path, prefix: str, name: str) -> Path:
    return data_dir / f"{prefix}{name}"


def _read_csv_safe(path: Path) -> pd.DataFrame:
    """Read CSV and return empty DataFrame on failure (logs)"""
    try:
        if not path.exists():
            return pd.DataFrame()
        df = pd.read_csv(path)
        return df
    except Exception as e:
        logger.warning(f"Failed to read CSV {path}: {e}")
        return pd.DataFrame()


def _normalize_column_names(df: pd.DataFrame, column_mapping: Dict[str, List[str]]) -> pd.DataFrame:
    """Rename columns in df to canonical names using mapping (case-insensitive)"""
    if df is None or df.empty:
        return df
    df_columns_lower = {col.lower(): col for col in df.columns}
    rename_map = {}
    for target, candidates in column_mapping.items():
        for cand in candidates:
            cand_l = cand.lower()
            if cand_l in df_columns_lower:
                rename_map[df_columns_lower[cand_l]] = target
                break
    if rename_map:
        df = df.rename(columns=rename_map)
    return df


def _filter_by_division(df: pd.DataFrame, division: str, division_col: str = "division") -> pd.DataFrame:
    """Filter df by division column (case-insensitive); returns df unchanged if column missing"""
    if df is None or df.empty:
        return df
    # find division column case-insensitively
    div_col = None
    for c in df.columns:
        if c.lower() == division_col.lower():
            div_col = c
            break
    if div_col is None:
        return df
    return df[df[div_col].astype(str).str.lower().str.strip() == division]


def load_division_dataset(division: str, use_cache: bool = True) -> Dict[str, Any]:
    """
    Load division-specific dataset with robust normalization.
    
    Uses in-memory cache to avoid reloading data on every request.

    Returns a dict with keys:
      division, stations, sections, trains, speed_restrictions,
      curves, bridges, electrification, loco_specs, disruptions

    Raises ValueError on critical validations (e.g., stations empty or sections reference unknown stations).
    Non-critical missing optional files are logged and returned as empty DataFrames.
    """
    division = division.lower().strip()
    
    # Check cache first
    if use_cache and division in _division_cache:
        logger.debug(f"Returning cached dataset for division: {division}")
        return _division_cache[division]
    # Normalize division name (handle bhusawal -> bhusaval)
    if division == "bhusawal":
        division = "bhusaval"
    
    if division not in VALID_DIVISIONS:
        raise ValueError(f"Invalid division: {division}. Must be one of {VALID_DIVISIONS}")

    # Check division-specific subdirectory first, then fall back to root data directory
    # Handle bhusawal/bhusaval naming inconsistency
    division_dir = DATA_DIR / division
    if not division_dir.exists() and division == "bhusaval":
        # Try bhusawal directory name
        division_dir = DATA_DIR / "bhusawal"
    
    if division_dir.exists() and division_dir.is_dir():
        data_path = division_dir
        prefix = ""
        filter_by_division = False  # Files are already division-specific
    else:
        # Fall back to root data directory (for combined CSV files)
        data_path = DATA_DIR
        prefix = ""
        filter_by_division = True  # Need to filter by division column

    result: Dict[str, Any] = {
        "division": division,
        "stations": pd.DataFrame(),
        "sections": pd.DataFrame(),
        "trains": pd.DataFrame(),
        "speed_restrictions": pd.DataFrame(),
        "curves": pd.DataFrame(),
        "bridges": pd.DataFrame(),
        "electrification": pd.DataFrame(),
        "loco_specs": pd.DataFrame(),
        "disruptions": pd.DataFrame(),
    }

    # ---------- Stations ----------
    stations_file_candidates = [
        _path_for(data_path, prefix, "stations.csv"),
        _path_for(data_path, prefix, "station.csv"),
        _path_for(data_path, prefix, "stations (1).csv"),
    ]
    stations_df = pd.DataFrame()
    stations_file_used = None
    for p in stations_file_candidates:
        logger.info(f"Checking stations file: {p} (exists: {p.exists()})")
        if p.exists():
            stations_df = _read_csv_safe(p)
            stations_file_used = p.name
            logger.info(f"Read {len(stations_df)} rows from {p.name}, columns: {list(stations_df.columns)}")
            break
    if stations_df.empty and filter_by_division:
        # try combined stations.csv if earlier failed
        combined = data_path / "stations.csv"
        if combined.exists():
            stations_df = _read_csv_safe(combined)
            stations_file_used = combined.name
            logger.info(f"Read {len(stations_df)} rows from combined file, columns: {list(stations_df.columns)}")

    if stations_df is None:
        stations_df = pd.DataFrame()
    # Normalize column names
    logger.info(f"Before normalization: {len(stations_df)} rows, columns: {list(stations_df.columns)}")
    stations_df = _normalize_column_names(stations_df, {
        "code": DEFAULT_COLUMN_MAP["code"],
        "name": DEFAULT_COLUMN_MAP["name"],
        "lat": DEFAULT_COLUMN_MAP["lat"],
        "lon": DEFAULT_COLUMN_MAP["lon"],
        "division": DEFAULT_COLUMN_MAP["division"],
    })
    logger.info(f"After normalization: {len(stations_df)} rows, columns: {list(stations_df.columns)}")
    if filter_by_division:
        logger.info(f"Filtering by division '{division}' (before: {len(stations_df)} rows)")
        stations_df = _filter_by_division(stations_df, division)
        logger.info(f"After filtering: {len(stations_df)} rows")

    # canonicalize station code and division
    if not stations_df.empty and "code" in stations_df.columns:
        stations_df["code"] = stations_df["code"].astype(str).str.strip().str.upper()
    if "division" in stations_df.columns:
        stations_df["division"] = stations_df["division"].astype(str).str.strip().str.lower()

    result["stations"] = stations_df
    logger.info(f"Loaded {len(stations_df)} stations for division '{division}' (source: {stations_file_used or 'none'}, data_path: {data_path})")
    if stations_df.empty:
        logger.warning(f"Division {division} loaded 0 stations - check CSV division column or station codes. Checked paths: {[str(p) for p in stations_file_candidates]}")

    # ---------- Sections ----------
    sections_file = _path_for(data_path, prefix, "sections.csv")
    if not sections_file.exists() and filter_by_division:
        # try alt filename
        alt = data_path / "sections (1).csv"
        if alt.exists():
            sections_file = alt

    sections_df = _read_csv_safe(sections_file) if sections_file.exists() else pd.DataFrame()
    logger.info(f"Read {len(sections_df)} sections from {sections_file if sections_file.exists() else 'none'}, columns: {list(sections_df.columns) if not sections_df.empty else []}")
    sections_df = _normalize_column_names(sections_df, {
        "section_id": DEFAULT_COLUMN_MAP["section_id"],
        "from_station": DEFAULT_COLUMN_MAP["from_station"],
        "to_station": DEFAULT_COLUMN_MAP["to_station"],
        "distance_km": DEFAULT_COLUMN_MAP["distance_km"],
        "tracks": DEFAULT_COLUMN_MAP["tracks"],
        "electrified": DEFAULT_COLUMN_MAP["electrified"],
        "max_speed_kmph": DEFAULT_COLUMN_MAP["max_speed_kmph"],
        "division": DEFAULT_COLUMN_MAP["division"],
    })
    logger.info(f"After normalization: {len(sections_df)} sections, columns: {list(sections_df.columns) if not sections_df.empty else []}")
    if filter_by_division:
        logger.info(f"Filtering sections by division '{division}' (before: {len(sections_df)} rows)")
        sections_df = _filter_by_division(sections_df, division)
        logger.info(f"After filtering: {len(sections_df)} rows")

    # normalize station codes in sections
    for col in ("from_station", "to_station"):
        if col in sections_df.columns:
            sections_df[col] = sections_df[col].astype(str).str.strip().str.upper()

    if "tracks" in sections_df.columns:
        sections_df["tracks"] = pd.to_numeric(sections_df["tracks"], errors="coerce").fillna(1).astype(int)

    result["sections"] = sections_df
    logger.info(f"Loaded {len(sections_df)} sections for division '{division}' (source: {sections_file.name if sections_file else 'none'})")
    if sections_df.empty:
        logger.warning(f"Division {division} loaded 0 sections - check CSV division column")

    # Try to fill missing station coords using sections adjacency
    try:
        if not result["stations"].empty and not result["sections"].empty:
            filled = _fill_missing_coords(result["stations"], result["sections"])
            result["stations"] = filled
            logger.info("Filled missing station coordinates using sections adjacency")
    except Exception as e:
        logger.debug(f"Coordinate fill skipped due to error: {e}")

    # ---------- Trains ----------
    trains_file = _path_for(data_path, prefix, "trains.csv")
    trains_df = _read_csv_safe(trains_file) if trains_file.exists() else pd.DataFrame()
    trains_df = _normalize_column_names(trains_df, {
        "train_id": DEFAULT_COLUMN_MAP["train_id"],
        "name": DEFAULT_COLUMN_MAP["name"],
        "type": ["type", "train_type"],
        "route": DEFAULT_COLUMN_MAP["route"],
        "max_speed_kmph": DEFAULT_COLUMN_MAP["max_speed_kmph"],
        "priority": DEFAULT_COLUMN_MAP["priority"] if "priority" in DEFAULT_COLUMN_MAP else ["priority"],
        "schedule": DEFAULT_COLUMN_MAP["schedule"],
        "division": DEFAULT_COLUMN_MAP["division"],
    })
    if filter_by_division:
        trains_df = _filter_by_division(trains_df, division)

    # Construct route from from_station_id/to_station_id if route column is missing
    if "route" not in trains_df.columns or trains_df["route"].isna().all():
        if "from_station" in trains_df.columns and "to_station" in trains_df.columns:
            # Create route as "from_station,to_station"
            trains_df["route"] = trains_df["from_station"].astype(str).str.strip().str.upper() + "," + trains_df["to_station"].astype(str).str.strip().str.upper()
            logger.info(f"Constructed route from from_station/to_station for {len(trains_df)} trains in division {division}")
        elif "from_station_id" in trains_df.columns and "to_station_id" in trains_df.columns:
            # Handle case where columns weren't normalized yet
            trains_df["route"] = trains_df["from_station_id"].astype(str).str.strip().str.upper() + "," + trains_df["to_station_id"].astype(str).str.strip().str.upper()
            logger.info(f"Constructed route from from_station_id/to_station_id for {len(trains_df)} trains in division {division}")

    # Filter trains by route membership (keep trains if any route station exists in division)
    if not result["stations"].empty and "route" in trains_df.columns:
        valid_station_codes = set(result["stations"]["code"].astype(str).str.strip().str.upper())
        def route_valid(route_str) -> bool:
            if pd.isna(route_str) or not str(route_str).strip():
                return False
            route_codes = [s.strip().upper() for s in str(route_str).replace("|", ",").split(",") if s.strip()]
            return any(code in valid_station_codes for code in route_codes)
        initial_count = len(trains_df)
        trains_df = trains_df[trains_df["route"].apply(route_valid)]
        filtered_count = len(trains_df)
        if initial_count != filtered_count:
            logger.info(f"Filtered trains by route membership: {initial_count} -> {filtered_count} for division {division}")

    # normalize route string representation (comma-joined upper codes)
    if "route" in trains_df.columns:
        trains_df["route"] = trains_df["route"].astype(str).apply(lambda x: ",".join([s.strip().upper() for s in x.replace("|", ",").split(",") if s.strip()]))

    result["trains"] = trains_df
    logger.info(f"Loaded {len(trains_df)} trains for division '{division}' (source: {trains_file.name if trains_file else 'none'})")

    # ---------- Speed restrictions ----------
    restrictions_file = _path_for(data_path, prefix, "speed_restrictions.csv")
    if not restrictions_file.exists() and filter_by_division:
        # try alternative names
        for alt in ["restrictions.csv", "speed_limits.csv"]:
            p = data_path / alt
            if p.exists():
                restrictions_file = p
                break
    restrictions_df = _read_csv_safe(restrictions_file) if restrictions_file.exists() else pd.DataFrame()
    if filter_by_division and "division" in restrictions_df.columns:
        restrictions_df = _filter_by_division(restrictions_df, division)
    result["speed_restrictions"] = restrictions_df
    if restrictions_df.empty:
        logger.warning(f"Speed restrictions file not found or empty for division {division}")

    # ---------- Curves / gradients ----------
    curves_file = _path_for(data_path, prefix, "curves_gradients.csv")
    if not curves_file.exists():
        curves_file = _path_for(data_path, prefix, "curves.csv")
    curves_df = _read_csv_safe(curves_file) if curves_file.exists() else pd.DataFrame()
    if filter_by_division and "division" in curves_df.columns:
        curves_df = _filter_by_division(curves_df, division)
    
    # Normalize curve column names - map curvature to max_curve_degree
    if not curves_df.empty:
        # Check if we have curvature column before normalization (to know if we need to convert units)
        had_curvature = "curvature" in curves_df.columns
        had_max_curve_degree = "max_curve_degree" in curves_df.columns
        
        curves_df = _normalize_column_names(curves_df, {
            "section_id": DEFAULT_COLUMN_MAP["section_id"],
            "max_curve_degree": ["max_curve_degree", "curvature", "curve_degree", "max_curvature"],
            "gradient": ["gradient", "grade"],
            "division": DEFAULT_COLUMN_MAP["division"],
        })
        
        # If we had curvature (which got normalized to max_curve_degree) but not max_curve_degree originally,
        # we need to convert the values from 1/km to degrees
        if had_curvature and not had_max_curve_degree and "max_curve_degree" in curves_df.columns:
            # Convert curvature (1/km) to approximate degrees
            # For railway curves: curvature of 0.001-0.005 1/km ≈ 1-5 degrees (gentle curves)
            # Using conversion factor: degrees ≈ curvature * 1000 (approximate)
            curves_df["max_curve_degree"] = pd.to_numeric(curves_df["max_curve_degree"], errors="coerce").fillna(0.0) * 1000.0
        elif "max_curve_degree" not in curves_df.columns:
            # If no curvature data, set default (no curve restriction)
            curves_df["max_curve_degree"] = 0.0
    
    result["curves"] = curves_df

    # ---------- Bridges ----------
    bridges_file = _path_for(data_path, prefix, "bridges.csv")
    bridges_df = _read_csv_safe(bridges_file) if bridges_file.exists() else pd.DataFrame()
    if filter_by_division and "division" in bridges_df.columns:
        bridges_df = _filter_by_division(bridges_df, division)
    result["bridges"] = bridges_df

    # ---------- Electrification ----------
    electrification_file = _path_for(data_path, prefix, "electrification.csv")
    if electrification_file.exists():
        elec_df = _read_csv_safe(electrification_file)
        if filter_by_division and "division" in elec_df.columns:
            elec_df = _filter_by_division(elec_df, division)
        result["electrification"] = elec_df
    else:
        # maybe electrified column in sections
        if not result["sections"].empty and "electrified" in result["sections"].columns:
            result["electrification"] = result["sections"][["section_id", "electrified"]].copy()
            logger.info(f"Using electrification from sections.csv for division {division}")
        else:
            result["electrification"] = pd.DataFrame()

    # ---------- Loco specs ----------
    loco_file = _path_for(data_path, prefix, "loco_specs.csv")
    if not loco_file.exists() and filter_by_division:
        for alt in ["rolling_stock.csv", "locomotives.csv"]:
            altp = data_path / alt
            if altp.exists():
                loco_file = altp
                break
    loco_df = _read_csv_safe(loco_file) if loco_file.exists() else pd.DataFrame()
    if filter_by_division and "division" in loco_df.columns:
        loco_df = _filter_by_division(loco_df, division)
    result["loco_specs"] = loco_df

    # ---------- Disruptions ----------
    disruptions_file = _path_for(data_path, prefix, "disruptions.csv")
    disruptions_df = _read_csv_safe(disruptions_file) if disruptions_file.exists() else pd.DataFrame()
    if filter_by_division and "division" in disruptions_df.columns:
        disruptions_df = _filter_by_division(disruptions_df, division)
    result["disruptions"] = disruptions_df

    # ---------- Basic validation ----------
    # Stations must not be empty for a usable simulation (raise ValueError)
    if result["stations"].empty:
        raise ValueError(f"Stations file for division '{division}' is empty or missing. Expected under {data_path}")

    # Sections must reference valid station codes
    station_codes = set(result["stations"]["code"].astype(str).str.strip().str.upper())
    missing_refs = set()
    if not result["sections"].empty:
        from_set = set(result["sections"]["from_station"].astype(str).str.strip().str.upper()) if "from_station" in result["sections"].columns else set()
        to_set = set(result["sections"]["to_station"].astype(str).str.strip().str.upper()) if "to_station" in result["sections"].columns else set()
        missing_from = from_set - station_codes
        missing_to = to_set - station_codes
        missing_refs |= missing_from
        missing_refs |= missing_to

    if missing_refs:
        raise ValueError(f"Section references unknown stations for division {division}: {sorted(list(missing_refs))}")

    # Validate trains routes (if trains present)
    bad_trains = []
    if not result["trains"].empty and "route" in result["trains"].columns:
        for idx, row in result["trains"].iterrows():
            train_id = row.get("train_id", f"row_{idx}")
            route_raw = str(row.get("route", "")).strip()
            route_codes = [s.strip().upper() for s in route_raw.replace("|", ",").split(",") if s.strip()]
            if len(route_codes) < 2:
                bad_trains.append((train_id, "short_or_empty_route"))
                continue
            unknown_stations = [s for s in route_codes if s not in station_codes]
            if unknown_stations:
                bad_trains.append((train_id, f"unknown_stations:{unknown_stations}"))
    if bad_trains:
        raise ValueError(f"trains.csv contains invalid routes for division {division}: {bad_trains}")

    # Cache the result
    if use_cache:
        _division_cache[division] = result
        logger.info(f"Cached dataset for division: {division}")

    return result


# ----------------- Helper utilities that external modules might use -----------------


def _infer_division_assignment(stations_df: pd.DataFrame, sections_df: pd.DataFrame) -> pd.DataFrame:
    """
    Infer division column for combined datasets when explicit division missing.

    Strategy:
    - Use station name heuristics to match city names (mumbai, pune, bhusaval, nagpur, solapur)
    - If heuristics fail for many rows, perform a simple k-means on lat/lon into up to 5 clusters (numpy)
    - Return dataframe with 'division' column set (may be empty string for unknown)
    """
    df = stations_df.copy()
    if df.empty:
        return df

    # find name column
    name_col = None
    for c in df.columns:
        if c.lower() in ("name", "station_name"):
            name_col = c
            break

    # keywords mapping
    city_keywords = {
        "mumbai": ["mumbai", "bct", "cstm", "vt", "madgaon", "mumbai cst"],
        "pune": ["pune", "pune jn", "pune j", "pune junction"],
        "bhusaval": ["bhusaval", "bhus"],
        "nagpur": ["nagpur"],
        "solapur": ["solapur", "solapur jn"]
    }

    def match_by_name(name: str) -> str:
        if not name or not isinstance(name, str):
            return ""
        low = name.lower()
        for div, kws in city_keywords.items():
            for kw in kws:
                if kw in low:
                    return div
        return ""

    inferred = []
    for _, row in df.iterrows():
        name = str(row.get(name_col, "")) if name_col else ""
        inferred.append(match_by_name(name))
    df["_inferred_div"] = inferred

    # if many not inferred, try kmeans on lat/lon
    try:
        import numpy as np
        if "lat" in df.columns and "lon" in df.columns:
            valid_coords_mask = (~df["lat"].isna()) & (~df["lon"].isna())
            if valid_coords_mask.sum() >= 5:
                pts = df.loc[valid_coords_mask, ["lat", "lon"]].astype(float).to_numpy()
                k = min(5, max(1, len(pts)))
                rng = np.random.default_rng(42)
                # initial centroids sampled
                centroids = pts[rng.choice(len(pts), size=k, replace=False)]
                for _ in range(20):
                    dists = np.linalg.norm(pts[:, None, :] - centroids[None, :, :], axis=2)
                    labels = np.argmin(dists, axis=1)
                    new_centroids = np.array([pts[labels == i].mean(axis=0) if np.any(labels == i) else centroids[i] for i in range(k)])
                    if np.allclose(new_centroids, centroids):
                        break
                    centroids = new_centroids
                # map clusters to divisions in stable order by centroid lat
                order = np.argsort(centroids[:, 0])
                division_order = ["mumbai", "pune", "bhusaval", "nagpur", "solapur"]
                cluster_to_div = {i: (division_order[idx] if idx < len(division_order) else f"div_{idx}") for idx, i in enumerate(order)}
                # build labels for all rows (for missing coords label by nearest centroid)
                all_pts = df[["lat", "lon"]].fillna(0.0).astype(float).to_numpy()
                dists_all = np.linalg.norm(all_pts[:, None, :] - centroids[None, :, :], axis=2)
                labels_all = np.argmin(dists_all, axis=1)
                for i in range(len(df)):
                    if df.at[i, "_inferred_div"] == "":
                        df.at[i, "_inferred_div"] = cluster_to_div.get(int(labels_all[i]), "")
    except Exception:
        # ignore clustering failures
        pass

    # write back to division column (preserve existing if present)
    div_col = None
    for c in df.columns:
        if c.lower() == "division":
            div_col = c
            break
    if div_col is None:
        df["division"] = df["_inferred_div"]
    else:
        df[div_col] = df["_inferred_div"]

    df = df.drop(columns=["_inferred_div"], errors="ignore")
    return df


def _fill_missing_coords(stations_df: pd.DataFrame, sections_df: pd.DataFrame) -> pd.DataFrame:
    """
    Iteratively fill missing lat/lon using neighboring station coordinates from sections.
    Returns a dataframe copy with lat/lon filled as possible.
    """
    df = stations_df.copy()
    if df.empty or ("lat" not in df.columns) or ("lon" not in df.columns):
        return df

    # normalize code column
    code_col = None
    for c in ["code", "station_code", "station_id"]:
        if c in df.columns:
            code_col = c
            break
    if code_col is None:
        return df

    df[code_col] = df[code_col].astype(str).str.strip().str.upper()

    # build adjacency from sections
    adj: Dict[str, set] = {}
    if sections_df is not None and not sections_df.empty:
        a_col = "from_station" if "from_station" in sections_df.columns else None
        b_col = "to_station" if "to_station" in sections_df.columns else None
        if a_col and b_col:
            for _, row in sections_df.iterrows():
                a = str(row.get(a_col, "")).strip().upper()
                b = str(row.get(b_col, "")).strip().upper()
                if not a or not b:
                    continue
                adj.setdefault(a, set()).add(b)
                adj.setdefault(b, set()).add(a)

    def valid_coord(v) -> bool:
        try:
            return (not pd.isna(v)) and float(v) != 0.0
        except Exception:
            return False

    max_iter = 8
    for _ in range(max_iter):
        changed = False
        for idx, row in df.iterrows():
            lat = row.get("lat", None)
            lon = row.get("lon", None)
            if valid_coord(lat) and valid_coord(lon):
                continue
            code = str(row.get(code_col, "")).strip().upper()
            neighbors = adj.get(code, set())
            neigh_coords = []
            for n in neighbors:
                nrows = df[df[code_col] == n]
                if not nrows.empty:
                    nlat = nrows.iloc[0].get("lat", None)
                    nlon = nrows.iloc[0].get("lon", None)
                    if valid_coord(nlat) and valid_coord(nlon):
                        neigh_coords.append((float(nlat), float(nlon)))
            if neigh_coords:
                avg_lat = sum(c[0] for c in neigh_coords) / len(neigh_coords)
                avg_lon = sum(c[1] for c in neigh_coords) / len(neigh_coords)
                df.at[idx, "lat"] = avg_lat
                df.at[idx, "lon"] = avg_lon
                changed = True
        if not changed:
            break

    # fill remaining missing with centroid of known coords
    known = df[(df["lat"].notna()) & (df["lon"].notna()) & (df["lat"] != 0.0) & (df["lon"] != 0.0)]
    if not known.empty:
        centroid_lat = known["lat"].astype(float).mean()
        centroid_lon = known["lon"].astype(float).mean()
        for idx, row in df.iterrows():
            lat = row.get("lat", None)
            lon = row.get("lon", None)
            if not valid_coord(lat) or not valid_coord(lon):
                df.at[idx, "lat"] = centroid_lat
                df.at[idx, "lon"] = centroid_lon

    return df


def normalize_stations(stations_df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Return list of station dicts with expected keys (code, name, lat, lon, division, is_junction, platforms)."""
    if stations_df is None or stations_df.empty:
        return []

    out = []
    for _, r in stations_df.fillna("").iterrows():
        code = ""
        for col in ["code", "station_code", "station_id"]:
            if col in r and r[col] != "":
                code = str(r[col]).strip().upper()
                break
        name = ""
        for col in ["name", "station_name"]:
            if col in r and r[col] != "":
                name = str(r[col]).strip()
                break
        lat = 0.0
        for col in ["lat", "latitude"]:
            if col in r and r[col] != "":
                try:
                    lat = float(r[col])
                    break
                except Exception:
                    pass
        lon = 0.0
        for col in ["lon", "longitude", "lng"]:
            if col in r and r[col] != "":
                try:
                    lon = float(r[col])
                    break
                except Exception:
                    pass
        station = {
            "code": code,
            "name": name,
            "lat": lat,
            "lon": lon,
            "division": str(r.get("division", "")).strip().lower() if r.get("division", "") != "" else "",
            "is_junction": bool(r.get("is_junction", False)) if r.get("is_junction", False) != "" else False,
            "platforms": int(r.get("platforms", 1)) if r.get("platforms", 1) != "" else 1,
        }
        out.append(station)
    return out


def normalize_sections(sections_df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Return list of section dicts with expected keys."""
    if sections_df is None or sections_df.empty:
        return []

    out = []
    for _, r in sections_df.fillna("").iterrows():
        section_id = str(r.get("section_id", "") or r.get("id", "")).strip()
        from_station = str(r.get("from_station", "")).strip().upper()
        to_station = str(r.get("to_station", "")).strip().upper()
        if not from_station or not to_station:
            logger.warning(f"Skipping section {section_id}: missing station codes (from={from_station}, to={to_station})")
            continue
        distance_km = 0.0
        try:
            distance_km = float(r.get("distance_km", 0.0) or 0.0)
        except Exception:
            distance_km = 0.0
        tracks = 1
        try:
            tracks = int(r.get("tracks", 1) or 1)
        except Exception:
            tracks = 1
        electrified = bool(r.get("electrified", False)) if r.get("electrified", False) != "" else False
        max_speed_kmph = 100.0
        try:
            max_speed_kmph = float(r.get("max_speed_kmph", 100.0) or 100.0)
        except Exception:
            max_speed_kmph = 100.0
        section = {
            "section_id": section_id,
            "from_station": from_station,
            "to_station": to_station,
            "distance_km": distance_km,
            "tracks": tracks,
            "electrified": electrified,
            "max_speed_kmph": max_speed_kmph,
            "line_type": str(r.get("line_type", "main")) if r.get("line_type", "main") != "" else "main",
            "division": str(r.get("division", "")).strip().lower() if r.get("division", "") != "" else "",
        }
        out.append(section)
    return out


def normalize_trains(trains_df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Return list of trains with parsed route (list) and schedule dict."""
    if trains_df is None or trains_df.empty:
        return []

    out = []
    for _, r in trains_df.iterrows():
        # train_id resolution
        train_id = ""
        for col in ["train_id", "trainno", "train_no", "id"]:
            if col in r and pd.notna(r[col]) and str(r[col]).strip() != "":
                train_id = str(r[col]).strip()
                break
        if not train_id:
            logger.warning(f"Skipping train with missing train_id: {r.to_dict()}")
            continue

        name = str(r.get("name", "")).strip() if pd.notna(r.get("name")) else ""
        t_type = str(r.get("type", "Passenger")).strip() if pd.notna(r.get("type")) else "Passenger"
        priority = 3
        try:
            priority = int(r.get("priority", 3)) if pd.notna(r.get("priority")) else 3
        except Exception:
            priority = 3
        max_speed_kmph = 100.0
        try:
            max_speed_kmph = float(r.get("max_speed_kmph", 100.0)) if pd.notna(r.get("max_speed_kmph")) else 100.0
        except Exception:
            max_speed_kmph = 100.0

        # parse schedule (may be JSON string)
        schedule = {}
        sched_raw = r.get("schedule", "{}")
        if pd.notna(sched_raw) and isinstance(sched_raw, str) and sched_raw.strip():
            try:
                schedule = json.loads(sched_raw)
            except Exception:
                # leave as empty dict if parse fails
                schedule = {}
        elif pd.notna(sched_raw) and isinstance(sched_raw, dict):
            schedule = sched_raw
        else:
            schedule = {}

        # parse route
        route_raw = r.get("route", "")
        route = []
        if pd.notna(route_raw) and isinstance(route_raw, str) and route_raw.strip():
            # support both comma and pipe separators
            route = [s.strip().upper() for s in route_raw.replace("|", ",").split(",") if s.strip()]

        train = {
            "train_id": train_id,
            "name": name,
            "type": t_type,
            "priority": priority,
            "route": route,
            "max_speed_kmph": max_speed_kmph,
            "schedule": schedule,
            "division": str(r.get("division", "")).strip().lower() if pd.notna(r.get("division")) else "",
        }
        out.append(train)
    return out