"""
Merge live train API data with CSV dataset fallback.

Provides `get_merged_live_trains(division)` which returns a dictionary shaped for the UI.
"""
from typing import Dict, Any, List
import asyncio
import logging
from datetime import datetime, timezone

from app.services.division_loader import load_division_dataset, normalize_stations
from app.services.live_train_service import LiveTrainService

logger = logging.getLogger(__name__)


async def _fetch_live_for_train(live_service: LiveTrainService, train_no: str):
    try:
        data = await live_service.get_live_train(train_no)
        return data
    except Exception as e:
        logger.debug(f"Live fetch failed for {train_no}: {e}")
        return None


def _build_station_km_map(sections: List[Dict[str, Any]], stations: List[Dict[str, Any]]):
    # Try to compute cumulative km using section distances. If unavailable, fallback to index*10
    km_map = {}
    # simple fallback: index * 10
    for idx, s in enumerate(stations):
        km_map[s.get('code') or s.get('name')] = float(idx * 10)

    try:
        # if sections provide distance_km and from/to station, accumulate distances
        # build adjacency chain - naive linear accumulation
        order = []
        seen = set()
        # start from stations order
        for s in stations:
            code = s.get('code') or s.get('name')
            if code and code not in seen:
                order.append(code)
                seen.add(code)

        cum = 0.0
        for i, code in enumerate(order):
            km_map[code] = cum
            # add next section distance if available
            if i < len(order) - 1:
                # try to find section matching code -> next
                for sec in sections:
                    if sec.get('from_station') == code and sec.get('to_station') == order[i+1]:
                        try:
                            dist = float(sec.get('distance_km') or 0.0)
                            cum += dist
                        except Exception:
                            cum += 10.0
                        break
                else:
                    cum += 10.0
    except Exception as e:
        logger.debug(f"Error building station km map: {e}")

    return km_map


async def get_merged_live_trains(division: str) -> Dict[str, Any]:
    """Return merged train/live data for a division.

    Output format:
    {
      "division": "mumbai",
      "stations": [{"name":"Kalyan","km":0}, ...],
      "trains": [{"id":"12110","name":"...","position_km":30.4,"speed":59,"eta":{...}}, ...]
    }
    """
    division_lower = division.lower().strip()

    # Load dataset
    try:
        dataset = load_division_dataset(division_lower)
    except Exception as e:
        logger.error(f"Failed to load dataset for {division_lower}: {e}", exc_info=True)
        dataset = {
            "stations": [],
            "sections": [],
            "trains": []
        }

    stations_df = dataset.get('stations')
    sections_df = dataset.get('sections')
    trains_df = dataset.get('trains')

    stations_list = normalize_stations(stations_df) if stations_df is not None else []
    sections_list = []
    if sections_df is not None:
        try:
            sections_list = sections_df.to_dict('records')
        except Exception:
            sections_list = []

    # Build station km map
    station_km = _build_station_km_map(sections_list, stations_list)

    # Prepare default trains from dataset
    dataset_trains = []
    if trains_df is not None:
        try:
            dataset_trains = trains_df.to_dict('records')
        except Exception:
            dataset_trains = []

    live_service = LiveTrainService()

    # Fetch live data concurrently (bounded)
    tasks = []
    for t in dataset_trains:
        train_no = str(t.get('train_id') or t.get('train') or t.get('train_no') or '').strip()
        if train_no:
            tasks.append(_fetch_live_for_train(live_service, train_no))

    live_results = []
    if tasks:
        # limit concurrency to 8
        semaphore = asyncio.Semaphore(8)

        async def _wrap(task_coro):
            async with semaphore:
                return await task_coro

        wrapped = [_wrap(c) for c in tasks]
        res = await asyncio.gather(*wrapped, return_exceptions=True)
        for r in res:
            if isinstance(r, Exception):
                live_results.append(None)
            else:
                live_results.append(r)

    # Map train_no -> live data
    live_map = {}
    # We assumed tasks order == dataset_trains order for train_no mapping
    idx = 0
    for t in dataset_trains:
        train_no = str(t.get('train_id') or t.get('train') or t.get('train_no') or '').strip()
        if train_no:
            live_map[train_no] = live_results[idx] if idx < len(live_results) else None
            idx += 1

    # Build output trains list
    out_trains = []
    for t in dataset_trains:
        train_no = str(t.get('train_id') or t.get('train') or t.get('train_no') or '').strip()
        name = t.get('name') or t.get('train_name') or ''
        live = live_map.get(train_no)
        position_km = 0.0
        speed = None
        eta = {}

        if live and isinstance(live, dict):
            # Try to extract station code or position
            curr = live.get('currentStatus') or live.get('current_status') or live.get('current') or live
            station_code = None
            if isinstance(curr, dict):
                station_code = curr.get('stationCode') or curr.get('station_code') or curr.get('code') or curr.get('station')
            # speed and other fields
            speed = live.get('speed') or live.get('currentSpeed') or None
            # ETA: attempt to extract arrivals from route if present
            if 'route' in live and isinstance(live['route'], list):
                # create ETA mapping from route entries if present
                for s in live['route']:
                    if isinstance(s, dict):
                        stn = s.get('stationCode') or s.get('station_code') or s.get('code') or s.get('station')
                        ttime = s.get('expectedArrival') or s.get('arrivalTime') or s.get('scheduledArrival') or s.get('time')
                        if stn and ttime:
                            eta[stn] = str(ttime)

            # compute position_km from station_code
            if station_code:
                position_km = float(station_km.get(station_code.upper(), station_km.get(station_code, 0.0)))
            else:
                # try position field
                pos = live.get('position_km') or live.get('position') or None
                if pos is not None:
                    try:
                        position_km = float(pos)
                    except Exception:
                        position_km = 0.0
        else:
            # No live info - estimate position from schedule/route
            route = t.get('route') or ''
            if isinstance(route, str):
                route_codes = [s.strip().upper() for s in route.replace('|', ',').split(',') if s.strip()]
            elif isinstance(route, list):
                route_codes = [s.strip().upper() for s in route if isinstance(s, str) and s.strip()]
            else:
                route_codes = []

            if route_codes:
                # pick first station in route as baseline
                first = route_codes[0]
                position_km = float(station_km.get(first, 0.0))

        out_trains.append({
            'id': train_no,
            'name': name,
            'position_km': round(float(position_km or 0.0), 2),
            'speed': float(speed) if speed is not None else None,
            'eta': eta
        })

    # Build stations output with km
    out_stations = []
    for s in stations_list:
        code = s.get('code') or s.get('name')
        out_stations.append({
            'name': s.get('name') or code,
            'km': float(station_km.get(code, 0.0))
        })

    return {
        'division': division_lower,
        'stations': out_stations,
        'trains': out_trains,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
