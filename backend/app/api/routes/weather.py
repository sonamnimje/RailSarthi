from fastapi import APIRouter
from app.services.weather_client import WeatherClient

router = APIRouter()
weather_client = WeatherClient()

@router.get("/weather/{lat}/{lon}")
async def get_weather(lat: float, lon: float):
	"""Return real-time weather for a given location."""
	return await weather_client.get_weather(lat, lon)

