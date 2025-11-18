"""
Live Integration Module for IRCTC Real-time Train Data.
Integrates with RapidAPI IRCTC endpoints to fetch live train positions, delays, and status.
"""
import httpx
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta, timezone
import logging
from dataclasses import dataclass

from app.services.rapidapi_client import get_rapidapi_client
from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class LiveTrainStatus:
    """Live train status from IRCTC API"""
    train_no: str
    train_name: str
    current_station_code: str
    current_station_name: str
    next_station_code: str
    next_station_name: str
    lat: float
    lon: float
    speed_kmph: float
    delay_minutes: int
    scheduled_arrival: Optional[datetime]
    actual_arrival: Optional[datetime]
    scheduled_departure: Optional[datetime]
    actual_departure: Optional[datetime]
    status: str  # "running", "stopped", "delayed", "on_time"
    last_updated: datetime
    route_updates: List[Dict[str, Any]]


class LiveIntegrationEngine:
    """Manages live train data integration from IRCTC APIs"""
    
    def __init__(self):
        """Initialize live integration engine"""
        try:
            self.rapidapi_client = get_rapidapi_client()
            self.enabled = True
        except Exception as e:
            logger.warning(f"RapidAPI client initialization failed: {e}. Live integration disabled.")
            self.rapidapi_client = None
            self.enabled = False
        
        self.live_train_cache: Dict[str, LiveTrainStatus] = {}  # train_no -> LiveTrainStatus
        self.cache_ttl = timedelta(minutes=2)  # Cache for 2 minutes
        self.update_interval = timedelta(seconds=10)  # Update every 10 seconds
        self.last_update: Optional[datetime] = None
        
    async def get_live_train_status(
        self, 
        train_no: str,
        stations_map: Dict[str, Dict[str, Any]]
    ) -> Optional[LiveTrainStatus]:
        """Get live train status from IRCTC API"""
        if not self.enabled or not self.rapidapi_client:
            return None
        
        # Check cache
        cached = self.live_train_cache.get(train_no)
        if cached and (datetime.now(timezone.utc) - cached.last_updated) < self.cache_ttl:
            return cached
        
        try:
            # Fetch from RapidAPI
            response = await self.rapidapi_client.get_live_train_status(train_no, start_day=1)
            
            if not response or "data" not in response:
                logger.debug(f"No live data available for train {train_no}")
                return None
            
            data = response["data"]
            
            # Parse current station
            current_station = data.get("currentStation", {})
            current_station_code = current_station.get("stationCode", "")
            current_station_name = current_station.get("stationName", "")
            
            # Parse next station
            next_station = data.get("nextStation", {})
            next_station_code = next_station.get("stationCode", "")
            next_station_name = next_station.get("stationName", "")
            
            # Get coordinates from stations map
            lat, lon = 0.0, 0.0
            if current_station_code in stations_map:
                station = stations_map[current_station_code]
                lat = station.get("lat", 0.0)
                lon = station.get("lon", 0.0)
            
            # Parse delay
            delay_minutes = int(data.get("delay", 0))
            
            # Parse speed (if available)
            speed_kmph = float(data.get("speed", 0.0))
            
            # Parse status
            status_str = data.get("status", "running").lower()
            if delay_minutes > 0:
                status = "delayed"
            elif status_str == "stopped":
                status = "stopped"
            elif delay_minutes == 0:
                status = "on_time"
            else:
                status = "running"
            
            # Parse timings
            scheduled_arrival = self._parse_datetime(data.get("scheduledArrival"))
            actual_arrival = self._parse_datetime(data.get("actualArrival"))
            scheduled_departure = self._parse_datetime(data.get("scheduledDeparture"))
            actual_departure = self._parse_datetime(data.get("actualDeparture"))
            
            # Parse route updates
            route_updates = data.get("routeUpdates", [])
            
            live_status = LiveTrainStatus(
                train_no=train_no,
                train_name=data.get("trainName", ""),
                current_station_code=current_station_code,
                current_station_name=current_station_name,
                next_station_code=next_station_code,
                next_station_name=next_station_name,
                lat=lat,
                lon=lon,
                speed_kmph=speed_kmph,
                delay_minutes=delay_minutes,
                scheduled_arrival=scheduled_arrival,
                actual_arrival=actual_arrival,
                scheduled_departure=scheduled_departure,
                actual_departure=actual_departure,
                status=status,
                last_updated=datetime.now(timezone.utc),
                route_updates=route_updates
            )
            
            # Cache it
            self.live_train_cache[train_no] = live_status
            
            return live_status
            
        except Exception as e:
            logger.warning(f"Failed to get live status for train {train_no}: {e}")
            return None
    
    def _parse_datetime(self, dt_str: Optional[str]) -> Optional[datetime]:
        """Parse datetime string from API response"""
        if not dt_str:
            return None
        
        try:
            # Try ISO format
            return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        except Exception:
            try:
                # Try common formats
                formats = [
                    "%Y-%m-%d %H:%M:%S",
                    "%Y-%m-%dT%H:%M:%S",
                    "%Y-%m-%dT%H:%M:%SZ"
                ]
                for fmt in formats:
                    try:
                        return datetime.strptime(dt_str, fmt).replace(tzinfo=timezone.utc)
                    except ValueError:
                        continue
            except Exception:
                pass
        
        return None
    
    async def sync_train(
        self, 
        train_no: str,
        stations_map: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Sync a train with live data - returns update information"""
        live_status = await self.get_live_train_status(train_no, stations_map)
        
        if not live_status:
            return {
                "synced": False,
                "message": "No live data available"
            }
        
        return {
            "synced": True,
            "train_no": train_no,
            "current_station": live_status.current_station_code,
            "next_station": live_status.next_station_code,
            "lat": live_status.lat,
            "lon": live_status.lon,
            "speed_kmph": live_status.speed_kmph,
            "delay_minutes": live_status.delay_minutes,
            "status": live_status.status,
            "last_updated": live_status.last_updated.isoformat()
        }
    
    async def update_multiple_trains(
        self,
        train_nos: List[str],
        stations_map: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Optional[LiveTrainStatus]]:
        """Update live status for multiple trains"""
        results = {}
        
        for train_no in train_nos:
            try:
                live_status = await self.get_live_train_status(train_no, stations_map)
                results[train_no] = live_status
            except Exception as e:
                logger.warning(f"Failed to update train {train_no}: {e}")
                results[train_no] = None
        
        return results
    
    def get_cached_status(self, train_no: str) -> Optional[LiveTrainStatus]:
        """Get cached live status for a train"""
        return self.live_train_cache.get(train_no)
    
    def clear_cache(self):
        """Clear live train cache"""
        self.live_train_cache.clear()
        logger.info("Live train cache cleared")
    
    def is_enabled(self) -> bool:
        """Check if live integration is enabled"""
        return self.enabled

