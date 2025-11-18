import httpx
import json
import os
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from dotenv import load_dotenv

from app.core.config import settings
from app.services.rapidapi_client import get_rapidapi_client

load_dotenv()

router = APIRouter()

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY") or settings.RAPIDAPI_IRCTC_KEY
_raw_host = os.getenv("RAPIDAPI_HOST") or settings.RAPIDAPI_IRCTC_HOST or "irctc1.p.rapidapi.com"
RAPIDAPI_HOST = _raw_host.rstrip("/")


def convert_time(raw_time):
    if raw_time in (None, "00:00", ""):
        return "-"
    try:
        hours, minutes = map(int, str(raw_time).split(":"))
        days = hours // 24
        hours = hours % 24
        tm = datetime.strptime(f"{hours:02d}:{minutes:02d}", "%H:%M")
        t = tm.strftime("%I:%M %p")
        if days:
            t += f" (+{days}d)"
        return t
    except:
        return raw_time


def pick(data: dict, *keys, default="-"):
    for k in keys:
        if k in data and data[k] not in (None, "", " "):
            return data[k]
    return default


@router.get("/live-trains")
async def get_live_trains(
    fromStationCode: str = Query(..., description="Station code e.g. MMCT"),
    hours: int = Query(2),
    trainNo: str = None
):

    if not RAPIDAPI_KEY:
        raise HTTPException(500, "Missing RAPIDAPI_KEY")

    url = f"https://{RAPIDAPI_HOST}/api/v3/getLiveStation"
    params = {
        "fromStationCode": fromStationCode,
        "hours": str(hours)
    }
    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST
    }

    try:
        client = get_rapidapi_client()
        # FIXED — use new request function
        data = await client._request(url, params=params, headers=headers)

        if not isinstance(data, dict):
            raise HTTPException(502, "Invalid response format")

        trains = data.get("data", [])
        if trainNo:
            trains = [t for t in trains if t.get("trainNumber") == trainNo]

        final = []
        for t in trains:
            arr_raw = pick(t, "arrivalTime", "arriveTime", default=None)
            dep_raw = pick(t, "departureTime", "departTime", default=None)

            final.append({
                "trainNumber": pick(t, "trainNumber", "train_no"),
                "trainName": pick(t, "trainName", "train_name"),
                "arrivalTime": convert_time(arr_raw),
                "departureTime": convert_time(dep_raw),
                "status": t.get("status", "RUNNING"),
                "platform": pick(t, "platformNumber", "platform"),
                "delay": t.get("delay", 0),
                "stationName": pick(t, "stationName", "station_name")
            })

        return {
            "station": fromStationCode,
            "total_trains": len(final),
            "trains": final
        }

    except Exception as e:
        raise HTTPException(500, f"Error fetching train data: {e}")