import httpx
from typing import Dict, Any
from app.core.config import settings


class WeatherClient:
	"""Fetch real-time weather data from OpenWeather API."""

	BASE_URL = "https://api.openweathermap.org/data/2.5/weather"

	async def get_weather(self, lat: float, lon: float) -> Dict[str, Any]:
		"""Get current weather for a given lat/lon."""

		if not settings.WEATHER_API_KEY:
			raise ValueError("WEATHER_API_KEY missing in .env")

		params = {
			"lat": lat,
			"lon": lon,
			"appid": settings.WEATHER_API_KEY,
			"units": "metric"
		}

		# Use connection pooling to prevent file descriptor exhaustion
		limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
		async with httpx.AsyncClient(timeout=20.0, limits=limits) as client:
			response = await client.get(self.BASE_URL, params=params)
			response.raise_for_status()
			return response.json()

