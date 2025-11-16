import os
import logging
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)


class RapidAPIClient:
    """Client for live train status (RapidAPI / IRCTC-like) and weather API.

    Keys are taken from environment variables:
    - RAPIDAPI_KEY for train live data
    - WEATHER_API_KEY for weather
    """

    def __init__(self):
        self.rapid_key = os.getenv("RAPIDAPI_KEY")
        self.weather_key = os.getenv("WEATHER_API_KEY")

    def get_train_status(self, train_no: str) -> Optional[Dict[str, Any]]:
        if not self.rapid_key:
            logger.warning("RAPIDAPI_KEY not set; returning None for train status")
            return None
        url = f"https://irctc-train-status.p.rapidapi.com/api/v1/liveTrainStatus?trainNo={train_no}"
        headers = {"X-RapidAPI-Key": self.rapid_key}
        try:
            r = requests.get(url, headers=headers, timeout=5)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.warning(f"RapidAPI train status fetch failed: {e}")
            return None

    def get_weather(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        if not self.weather_key:
            logger.warning("WEATHER_API_KEY not set; returning None for weather")
            return None
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={self.weather_key}&units=metric"
        try:
            r = requests.get(url, timeout=5)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            logger.warning(f"Weather fetch failed: {e}")
            return None
"""
RapidAPI IRCTC client for fetching train data.
"""
import httpx
from typing import Any, Dict
from fastapi import HTTPException
import logging
from ..core.config import settings

logger = logging.getLogger(__name__)


class RapidAPIClient:
	"""Client for RapidAPI IRCTC endpoints."""
	
	def __init__(self) -> None:
		self.rapidapi_key = settings.RAPIDAPI_IRCTC_KEY
		self.rapidapi_host = settings.RAPIDAPI_IRCTC_HOST or "irctc1.p.rapidapi.com"
		
		if not self.rapidapi_key:
			raise ValueError("RAPIDAPI_IRCTC_KEY is not configured. Set environment variable RAPIDAPI_IRCTC_KEY.")
	
	async def get_live_station(self, from_station_code: str, to_station_code: str, hours: int = 8) -> Dict[str, Any]:
		"""Get live station data from RapidAPI IRCTC endpoint.
		
		Returns real-time train movements at a station.
		
		Args:
			from_station_code: Source station code
			to_station_code: Destination station code
			hours: Number of hours to look ahead (default: 8)
		"""
		url = f"https://{self.rapidapi_host}/api/v3/getLiveStation"
		params = {
			"fromStationCode": from_station_code,
			"toStationCode": to_station_code,
			"hours": str(hours)
		}
		
		headers = {
			"X-RapidAPI-Key": self.rapidapi_key,
			"X-RapidAPI-Host": self.rapidapi_host
		}
		
		try:
			async with httpx.AsyncClient(timeout=30.0) as client:
				resp = await client.get(url, headers=headers, params=params)
				resp.raise_for_status()
				return resp.json()
		except Exception as e:
			logger.error(f"RapidAPI Error in get_live_station: {e}")
			raise HTTPException(status_code=500, detail="RapidAPI request failed")

	async def get_train_schedule(self, train_no: str) -> Dict[str, Any]:
		"""Get train schedule (timetable) from RapidAPI IRCTC endpoint.
		
		Returns the official timetable with planned stops, timings, and distances.
		"""
		url = f"https://{self.rapidapi_host}/api/v1/getTrainSchedule"
		params = {
			"trainNo": train_no
		}
		
		headers = {
			"X-RapidAPI-Key": self.rapidapi_key,
			"X-RapidAPI-Host": self.rapidapi_host
		}
		
		try:
			async with httpx.AsyncClient(timeout=30.0) as client:
				resp = await client.get(url, headers=headers, params=params)
				resp.raise_for_status()
				return resp.json()
		except Exception as e:
			logger.error(f"RapidAPI Error in get_train_schedule: {e}")
			raise HTTPException(status_code=500, detail="RapidAPI request failed")

	async def get_live_train_status(self, train_no: str, start_day: int = 1) -> Dict[str, Any]:
		"""Get live train status (real-time running info) from RapidAPI IRCTC endpoint.
		
		Returns current position, delays, actual arrival/departure times, and movement logs.
		
		Args:
			train_no: The train number
			start_day: Day of journey (1 = same day, 2 = next day, etc.) depending on when train started
		"""
		url = f"https://{self.rapidapi_host}/api/v1/liveTrainStatus"
		params = {
			"trainNo": train_no,
			"startDay": str(start_day)
		}
		
		headers = {
			"X-RapidAPI-Key": self.rapidapi_key,
			"X-RapidAPI-Host": self.rapidapi_host
		}
		
		try:
			async with httpx.AsyncClient(timeout=30.0) as client:
				resp = await client.get(url, headers=headers, params=params)
				resp.raise_for_status()
				return resp.json()
		except Exception as e:
			logger.error(f"RapidAPI Error in get_live_train_status: {e}")
			raise HTTPException(status_code=500, detail="RapidAPI request failed")

	async def get_trains_between_stations(
		self, 
		from_station_code: str, 
		to_station_code: str, 
		date: str | None = None
	) -> Dict[str, Any]:
		"""Get trains between two stations from RapidAPI IRCTC endpoint.
		
		Returns list of trains running between source and destination stations.
		
		Args:
			from_station_code: Source station code (e.g., "NDLS" for New Delhi)
			to_station_code: Destination station code (e.g., "BCT" for Mumbai Central)
			date: Date in format "YYYY-MM-DD" (optional, defaults to today)
		"""
		url = f"https://{self.rapidapi_host}/api/v1/searchTrain"
		params = {
			"fromStationCode": from_station_code,
			"toStationCode": to_station_code
		}
		
		if date:
			params["date"] = date
		
		headers = {
			"X-RapidAPI-Key": self.rapidapi_key,
			"X-RapidAPI-Host": self.rapidapi_host
		}
		
		try:
			async with httpx.AsyncClient(timeout=30.0) as client:
				resp = await client.get(url, headers=headers, params=params)
				resp.raise_for_status()
				return resp.json()
		except Exception as e:
			logger.error(f"RapidAPI Error in get_trains_between_stations: {e}")
			raise HTTPException(status_code=500, detail="RapidAPI request failed")

