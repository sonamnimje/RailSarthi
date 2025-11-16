"""
Weather API Routes
Endpoints for weather data and updates
"""
from fastapi import APIRouter, HTTPException, Path, Query
from typing import Dict, Any
from datetime import datetime, timezone
import logging

from app.core.weather_engine import WeatherEngine
from app.services.division_loader import load_division_dataset, normalize_stations

router = APIRouter(prefix="/api/weather", tags=["weather"])
logger = logging.getLogger(__name__)

# Global weather engine
_weather_engine: WeatherEngine = None

def get_weather_engine() -> WeatherEngine:
    """Get or create weather engine"""
    global _weather_engine
    if _weather_engine is None:
        _weather_engine = WeatherEngine()
    return _weather_engine


@router.get("/{station_code}")
async def get_weather_for_station(
    station_code: str = Path(..., description="Station code"),
    division: str = Query("mumbai", description="Division name")
) -> Dict[str, Any]:
    """Get weather condition for a station"""
    try:
        # Load division to get station coordinates
        dataset = load_division_dataset(division.lower())
        stations_df = dataset.get("stations")
        stations_list = normalize_stations(stations_df) if stations_df is not None and not stations_df.empty else []
        
        station = None
        for s in stations_list:
            if s["code"].upper() == station_code.upper():
                station = s
                break
        
        if not station:
            raise HTTPException(
                status_code=404,
                detail=f"Station {station_code} not found in division {division}"
            )
        
        lat = station.get("lat", 0.0)
        lon = station.get("lon", 0.0)
        
        if lat == 0.0 or lon == 0.0:
            raise HTTPException(
                status_code=400,
                detail=f"Station {station_code} has invalid coordinates"
            )
        
        weather_engine = get_weather_engine()
        weather = await weather_engine.get_weather_for_station(station_code.upper(), lat, lon)
        
        speed_factor = weather_engine.calculate_speed_factor(weather)
        braking_factor = weather_engine.calculate_braking_distance_factor(weather)
        alert = weather_engine.get_weather_alert(weather)
        
        return {
            "station_code": station_code.upper(),
            "station_name": station.get("name", ""),
            "temperature": weather.temperature,
            "visibility_m": weather.visibility_m,
            "wind_speed_kmph": weather.wind_speed_kmph,
            "precipitation_mm": weather.precipitation_mm,
            "condition": weather.condition,
            "humidity": weather.humidity,
            "pressure_hpa": weather.pressure_hpa,
            "speed_factor": speed_factor,
            "braking_distance_factor": braking_factor,
            "alert": alert,
            "timestamp": weather.timestamp.isoformat()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting weather for station {station_code}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get weather: {str(e)}")


@router.post("/update")
async def update_weather(
    division: str = Query(..., description="Division name")
) -> Dict[str, Any]:
    """Update weather for all stations in a division"""
    try:
        # Load division
        dataset = load_division_dataset(division.lower())
        stations_df = dataset.get("stations")
        stations_list = normalize_stations(stations_df) if stations_df is not None and not stations_df.empty else []
        stations_map = {s["code"]: s for s in stations_list}
        
        weather_engine = get_weather_engine()
        weather_map = await weather_engine.update_weather_for_stations(stations_map)
        
        return {
            "status": "updated",
            "division": division.lower(),
            "stations_updated": len(weather_map),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    
    except Exception as e:
        logger.error(f"Error updating weather for division {division}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update weather: {str(e)}")

