"""
RapidAPI IRCTC client for fetching train data.
"""
import httpx
from typing import Any, Dict
from ..core.config import settings


class RapidAPIClient:
	"""Client for RapidAPI IRCTC endpoints."""
	
	def __init__(self) -> None:
		self.rapidapi_key = settings.RAPIDAPI_IRCTC_KEY
		self.rapidapi_host = settings.RAPIDAPI_IRCTC_HOST
		
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
			"X-Rapidapi-Key": self.rapidapi_key,
			"X-Rapidapi-Host": self.rapidapi_host
		}
		
		async with httpx.AsyncClient(timeout=30.0) as client:
			resp = await client.get(url, headers=headers, params=params)
			resp.raise_for_status()
			return resp.json()

	async def get_train_schedule(self, train_no: str) -> Dict[str, Any]:
		"""Get train schedule (timetable) from RapidAPI IRCTC endpoint.
		
		Returns the official timetable with planned stops, timings, and distances.
		"""
		url = f"https://{self.rapidapi_host}/api/v1/getTrainSchedule"
		params = {
			"trainNo": train_no
		}
		
		headers = {
			"X-Rapidapi-Key": self.rapidapi_key,
			"X-Rapidapi-Host": self.rapidapi_host
		}
		
		async with httpx.AsyncClient(timeout=30.0) as client:
			resp = await client.get(url, headers=headers, params=params)
			resp.raise_for_status()
			return resp.json()

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
			"X-Rapidapi-Key": self.rapidapi_key,
			"X-Rapidapi-Host": self.rapidapi_host
		}
		
		async with httpx.AsyncClient(timeout=30.0) as client:
			resp = await client.get(url, headers=headers, params=params)
			resp.raise_for_status()
			return resp.json()

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
			"X-Rapidapi-Key": self.rapidapi_key,
			"X-Rapidapi-Host": self.rapidapi_host
		}
		
		async with httpx.AsyncClient(timeout=30.0) as client:
			resp = await client.get(url, headers=headers, params=params)
			resp.raise_for_status()
			return resp.json()

