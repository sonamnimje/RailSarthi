import http.client
import json
import os
from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException, Query
from dotenv import load_dotenv

# Load .env file
load_dotenv()

router = APIRouter()

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
RAPIDAPI_HOST = "irctc1.p.rapidapi.com"

if not RAPIDAPI_KEY:
    raise RuntimeError("Missing RAPIDAPI_KEY in environment variables or .env file")


def convert_time(raw_time):
    """
    Convert times like '60:50' -> '12:50 PM (+2d)' and '00:00' -> '-'
    """
    if raw_time is None:
        return "-"
    if not isinstance(raw_time, str):
        raw_time = str(raw_time)
    if not raw_time or raw_time == "00:00":
        return "-"
    try:
        hours, minutes = map(int, raw_time.split(":"))
        days_offset = hours // 24
        hours = hours % 24
        dt = datetime.strptime(f"{hours:02d}:{minutes:02d}", "%H:%M")
        time_str = dt.strftime("%I:%M %p")
        if days_offset:
            time_str += f" (+{days_offset}d)"
        return time_str
    except Exception:
        return raw_time


def _extract_field(data: dict, *keys, default="-"):
    """
    Safely pick the first non-empty value among the provided keys.
    Handles differences in casing or naming returned by RapidAPI.
    """
    for key in keys:
        if key not in data:
            continue
        value = data.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return default


def _normalize_stop(value):
    """
    Convert the stop information into a consistent boolean-ish flag.
    RapidAPI can return Y/N, Yes/No, 1/0 or descriptive strings.
    """
    if value is None:
        return False
    if isinstance(value, bool):
        return value

    text = str(value).strip().lower()
    if text in {"y", "yes", "true", "1", "stop", "stoppage"}:
        return True
    if text in {"n", "no", "false", "0", "non stop", "non-stop", "pass"}:
        return False
    # Fallback: any other non-empty value → treat as True
    return bool(text)


@router.get("/live-trains")
async def get_live_trains(
    fromStationCode: str = Query(..., description="Station code (e.g., NDLS)"),
    hours: int = Query(2, description="Hours range for train data"),
    trainNo: str = Query(None, description="Optional train number (e.g., 12001) to filter a specific train"),
):
    """
    Fetch real-time trains arriving/departing from a station using RapidAPI IRCTC1.
    Normalizes times and ensures consistent fields for frontend.
    """
    # Validate station code
    if not fromStationCode or not fromStationCode.strip():
        raise HTTPException(status_code=400, detail="Station code cannot be empty")
    
    fromStationCode = fromStationCode.strip().upper()
    
    # Validate hours parameter
    if hours < 1 or hours > 24:
        raise HTTPException(status_code=400, detail="Hours must be between 1 and 24")
    
    # Check API key is available
    if not RAPIDAPI_KEY:
        raise HTTPException(
            status_code=500,
            detail="RapidAPI key is not configured. Please set RAPIDAPI_KEY environment variable."
        )
    
    url = f"https://{RAPIDAPI_HOST}/api/v3/getLiveStation"
    headers = {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST
    }
    params = {
        "fromStationCode": fromStationCode,
        "hours": hours
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers, params=params)

        if response.status_code != 200:
            error_text = response.text[:500] if response.text else "No error message"
            raise HTTPException(
                status_code=response.status_code,
                detail=f"RapidAPI error: {error_text}"
            )

        try:
            data = response.json()
        except Exception as json_error:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid JSON response from RapidAPI: {str(json_error)}"
            )

        # Check if response has expected structure
        if not isinstance(data, dict):
            raise HTTPException(
                status_code=502,
                detail=f"Unexpected response format from RapidAPI: expected dict, got {type(data).__name__}"
            )

        # Check status field
        if not data.get("status"):
            error_msg = data.get("message") or data.get("error") or "Unknown error from RapidAPI"
            raise HTTPException(
                status_code=404,
                detail=f"No train data found: {error_msg}"
            )

        # Check data field exists and is a list
        trains_data = data.get("data")
        if trains_data is None:
            raise HTTPException(
                status_code=404,
                detail="No train data found for this station."
            )

        if not isinstance(trains_data, list):
            raise HTTPException(
                status_code=502,
                detail=f"Unexpected data format: expected list, got {type(trains_data).__name__}"
            )

        trains = trains_data

        # Optional filter by train number
        if trainNo:
            trains = [t for t in trains if isinstance(t, dict) and t.get("trainNumber") == trainNo]
            if not trains:
                raise HTTPException(status_code=404, detail=f"Train {trainNo} not found at {fromStationCode}.")

        # Normalize train data for frontend
        normalized_trains = []
        for t in trains:
            if not isinstance(t, dict):
                continue  # Skip invalid entries
            
            try:
                arrival_raw = _extract_field(t, "arrivalTime", "arriveTime", "arrival_time", default=None)
                departure_raw = _extract_field(t, "departureTime", "departTime", "departure_time", default=None)
                normalized_trains.append({
                    "trainNumber": _extract_field(t, "trainNumber", "train_no", "train_no_h1"),
                    "trainName": _extract_field(t, "trainName", "train_name"),
                    "trainType": _extract_field(t, "trainType", "train_type"),
                    "arrivalTime": convert_time(arrival_raw if arrival_raw is not None else "-"),
                    "departureTime": convert_time(departure_raw if departure_raw is not None else "-"),
                    "status": "Scheduled" if (arrival_raw not in (None, "00:00")) else "Origin",
                    "platform_number": _extract_field(t, "platform_number", "platformNumber", "platform"),
                    "train_src": _extract_field(t, "train_src", "trainSrc", "train_source", "trainSource"),
                    "stop": _normalize_stop(_extract_field(t, "stop", "is_stop", "isStop", "stoppage", default=None)),
                    "station_name": _extract_field(t, "station_name", "stationName", "station_name_h1"),
                    "halt": _extract_field(t, "halt", "halt_minutes", "haltMin", "halt_min"),
                    "on_time_rating": _extract_field(t, "on_time_rating", "onTimeRating", "on_time_rating_h1"),
                    "delay": _extract_field(t, "delay", "delay_arrival", "delay_h1", default=0)
                })
            except Exception as train_error:
                # Log but continue processing other trains
                print(f"Warning: Error processing train entry: {train_error}, data: {t}")
                continue

        return {
            "station": fromStationCode,
            "total_trains": len(normalized_trains),
            "trains": normalized_trains
        }

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"DEBUG ERROR in get_live_trains: {e}")
        print(f"Traceback: {error_trace}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching train data: {str(e)}"
        )


@router.get("/train-status")
def get_live_train_status(
    trainNo: str = Query(..., description="Train number (e.g., 19038)"),
    startDay: int = Query(1, ge=1, le=4, description="Journey start day (1=same day, 2=next day, etc.)"),
):
    """
    Fetch the live running status for a specific train.

    This wraps RapidAPI's `/api/v1/liveTrainStatus` endpoint.

    The response is returned as-is from RapidAPI so the frontend can access the
    full structure, including current status, route details, and delays.
    """
    if not trainNo.strip():
        raise HTTPException(status_code=400, detail="Train number is required.")

    conn = http.client.HTTPSConnection(RAPIDAPI_HOST, timeout=15)
    headers = {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
    }

    try:
        path = f"/api/v1/liveTrainStatus?trainNo={trainNo}&startDay={startDay}"
        conn.request("GET", path, headers=headers)
        res = conn.getresponse()
        payload = res.read()
    except Exception as exc:
        conn.close()
        raise HTTPException(status_code=502, detail=f"RapidAPI request failed: {exc}") from exc

    try:
        data = json.loads(payload.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"Invalid response from RapidAPI: {exc}") from exc
    finally:
        conn.close()

    if res.status != 200 or not data.get("status"):
        detail = data.get("message") or data.get("error") or data
        raise HTTPException(status_code=res.status or 502, detail=f"RapidAPI error: {detail}")

    return data