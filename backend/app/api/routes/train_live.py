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

    # RapidAPI removed: return empty dataset with clear message
    return {
        "station": fromStationCode,
        "total_trains": 0,
        "trains": [],
        "note": "RapidAPI live train feed disabled"
    }