"""
Weather Engine for Railway Digital Twin.
Fetches and applies weather effects on train speeds, visibility, and operations.
"""
import httpx
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, timezone
import logging
from dataclasses import dataclass

from app.core.config import settings
from app.services.weather_client import WeatherClient

logger = logging.getLogger(__name__)


@dataclass
class WeatherCondition:
    """Weather condition at a location"""
    temperature: float
    visibility_m: int
    wind_speed_kmph: float
    precipitation_mm: float
    condition: str  # "clear", "rain", "fog", "storm", "snow"
    humidity: float
    pressure_hpa: float
    timestamp: datetime
    station_code: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


class WeatherEngine:
    """Manages weather data and effects for railway operations"""
    
    def __init__(self):
        """Initialize weather engine"""
        self.weather_client = WeatherClient()
        self.weather_cache: Dict[str, WeatherCondition] = {}  # station_code -> WeatherCondition
        self.cache_ttl = timedelta(minutes=10)  # Cache weather for 10 minutes
        
    async def get_weather_for_station(
        self, 
        station_code: str, 
        lat: float, 
        lon: float
    ) -> WeatherCondition:
        """Get weather condition for a station"""
        # Check cache
        cached = self.weather_cache.get(station_code)
        if cached and (datetime.now(timezone.utc) - cached.timestamp) < self.cache_ttl:
            return cached
        
        try:
            # Fetch from API
            weather_data = await self.weather_client.get_weather(lat, lon)
            
            # Parse weather data
            condition = self._parse_weather_condition(weather_data)
            weather_condition = WeatherCondition(
                temperature=weather_data.get("main", {}).get("temp", 25.0),
                visibility_m=weather_data.get("visibility", 10000),
                wind_speed_kmph=self._convert_wind_speed(weather_data.get("wind", {})),
                precipitation_mm=weather_data.get("rain", {}).get("1h", 0.0) if "rain" in weather_data else 0.0,
                condition=condition,
                humidity=weather_data.get("main", {}).get("humidity", 60.0),
                pressure_hpa=weather_data.get("main", {}).get("pressure", 1013.0),
                timestamp=datetime.now(timezone.utc),
                station_code=station_code,
                lat=lat,
                lon=lon
            )
            
            # Cache it
            self.weather_cache[station_code] = weather_condition
            
            return weather_condition
            
        except Exception as e:
            logger.warning(f"Failed to fetch weather for station {station_code}: {e}")
            # Return default clear weather
            return WeatherCondition(
                temperature=25.0,
                visibility_m=10000,
                wind_speed_kmph=10.0,
                precipitation_mm=0.0,
                condition="clear",
                humidity=60.0,
                pressure_hpa=1013.0,
                timestamp=datetime.now(timezone.utc),
                station_code=station_code,
                lat=lat,
                lon=lon
            )
    
    def _parse_weather_condition(self, weather_data: Dict[str, Any]) -> str:
        """Parse weather condition from API response"""
        weather_main = weather_data.get("weather", [{}])[0].get("main", "").lower()
        weather_desc = weather_data.get("weather", [{}])[0].get("description", "").lower()
        
        if "thunderstorm" in weather_main or "storm" in weather_desc:
            return "storm"
        elif "rain" in weather_main or "drizzle" in weather_main:
            return "rain"
        elif "fog" in weather_main or "mist" in weather_main or "haze" in weather_main:
            return "fog"
        elif "snow" in weather_main:
            return "snow"
        else:
            return "clear"
    
    def _convert_wind_speed(self, wind_data: Dict[str, Any]) -> float:
        """Convert wind speed from m/s to km/h"""
        wind_speed_ms = wind_data.get("speed", 0.0)
        return wind_speed_ms * 3.6
    
    def calculate_speed_factor(self, weather: WeatherCondition) -> float:
        """Calculate speed reduction factor based on weather (0.0 to 1.0)"""
        factor = 1.0
        
        # Rain effects
        if weather.condition == "rain":
            if weather.precipitation_mm > 10:  # Heavy rain
                factor *= 0.7
            else:  # Light rain
                factor *= 0.9
        
        # Fog effects
        if weather.condition == "fog":
            if weather.visibility_m < 200:  # Dense fog
                factor *= 0.5
            elif weather.visibility_m < 500:  # Moderate fog
                factor *= 0.7
            else:  # Light fog
                factor *= 0.9
        
        # Storm effects
        if weather.condition == "storm":
            factor *= 0.5  # Severe speed reduction
        
        # Snow effects
        if weather.condition == "snow":
            factor *= 0.6
        
        # Wind effects (strong crosswinds)
        if weather.wind_speed_kmph > 50:  # Strong wind
            factor *= 0.9
        
        return factor
    
    def calculate_braking_distance_factor(self, weather: WeatherCondition) -> float:
        """Calculate braking distance multiplier based on weather"""
        factor = 1.0
        
        # Wet tracks increase braking distance
        if weather.condition in ["rain", "snow"]:
            factor = 1.5  # 50% longer braking distance
        
        # Fog reduces visibility but doesn't affect braking distance directly
        # (it affects reaction time, which is handled separately)
        
        return factor
    
    def get_weather_alert(self, weather: WeatherCondition) -> Optional[Dict[str, Any]]:
        """Get weather alert if conditions are severe"""
        alerts = []
        
        if weather.condition == "storm":
            alerts.append({
                "type": "severe_weather",
                "severity": "critical",
                "message": f"Thunderstorm detected at {weather.station_code}. Speed reduced to 50%.",
                "station_code": weather.station_code
            })
        
        if weather.condition == "fog" and weather.visibility_m < 200:
            alerts.append({
                "type": "low_visibility",
                "severity": "high",
                "message": f"Dense fog at {weather.station_code}. Visibility: {weather.visibility_m}m. Speed reduced.",
                "station_code": weather.station_code
            })
        
        if weather.precipitation_mm > 20:  # Heavy rain
            alerts.append({
                "type": "heavy_rain",
                "severity": "medium",
                "message": f"Heavy rain at {weather.station_code}. Speed reduced.",
                "station_code": weather.station_code
            })
        
        return alerts[0] if alerts else None
    
    async def update_weather_for_stations(
        self, 
        stations: Dict[str, Dict[str, Any]]
    ) -> Dict[str, WeatherCondition]:
        """Update weather for multiple stations"""
        weather_map = {}
        
        for station_code, station_data in stations.items():
            lat = station_data.get("lat", 0.0)
            lon = station_data.get("lon", 0.0)
            
            if lat == 0.0 or lon == 0.0:
                continue
            
            try:
                weather = await self.get_weather_for_station(station_code, lat, lon)
                weather_map[station_code] = weather
            except Exception as e:
                logger.warning(f"Failed to update weather for {station_code}: {e}")
        
        return weather_map
    
    def clear_cache(self):
        """Clear weather cache"""
        self.weather_cache.clear()
        logger.info("Weather cache cleared")

