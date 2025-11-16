"""
Live Train Data API Routes
Endpoints for IRCTC live train status integration
"""
from fastapi import APIRouter, HTTPException, Path
from typing import Dict, Any
import logging

from app.core.live_integration import LiveIntegrationEngine
from app.services.division_loader import load_division_dataset, normalize_stations

router = APIRouter(prefix="/api/live", tags=["live-train"])
logger = logging.getLogger(__name__)

# Global live integration engine
_live_engine: LiveIntegrationEngine = None

def get_live_engine() -> LiveIntegrationEngine:
    """Get or create live integration engine"""
    global _live_engine
    if _live_engine is None:
        _live_engine = LiveIntegrationEngine()
    return _live_engine


@router.get("/train/{train_no}")
async def get_live_train_status(
    train_no: str = Path(..., description="Train number")
) -> Dict[str, Any]:
    """Get live train status from IRCTC API"""
    try:
        live_engine = get_live_engine()
        
        if not live_engine.is_enabled():
            raise HTTPException(
                status_code=503,
                detail="Live train integration is not enabled. RAPIDAPI_IRCTC_KEY not configured."
            )
        
        # Load a default division to get stations map (in production, would be more sophisticated)
        # For now, use mumbai as default
        try:
            dataset = load_division_dataset("mumbai")
            stations_df = dataset.get("stations")
            stations_list = normalize_stations(stations_df) if stations_df is not None and not stations_df.empty else []
            stations_map = {s["code"]: s for s in stations_list}
        except Exception:
            stations_map = {}
        
        live_status = await live_engine.get_live_train_status(train_no, stations_map)
        
        if not live_status:
            raise HTTPException(
                status_code=404,
                detail=f"Live status not available for train {train_no}"
            )
        
        return {
            "train_no": live_status.train_no,
            "train_name": live_status.train_name,
            "current_station": {
                "code": live_status.current_station_code,
                "name": live_status.current_station_name
            },
            "next_station": {
                "code": live_status.next_station_code,
                "name": live_status.next_station_name
            },
            "position": {
                "lat": live_status.lat,
                "lon": live_status.lon
            },
            "speed_kmph": live_status.speed_kmph,
            "delay_minutes": live_status.delay_minutes,
            "status": live_status.status,
            "scheduled_arrival": live_status.scheduled_arrival.isoformat() if live_status.scheduled_arrival else None,
            "actual_arrival": live_status.actual_arrival.isoformat() if live_status.actual_arrival else None,
            "last_updated": live_status.last_updated.isoformat()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting live status for train {train_no}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get live train status: {str(e)}")


@router.post("/sync/{train_no}")
async def sync_train(
    train_no: str = Path(..., description="Train number"),
    division: str = "mumbai"
) -> Dict[str, Any]:
    """Sync a train with live IRCTC data"""
    try:
        live_engine = get_live_engine()
        
        if not live_engine.is_enabled():
            raise HTTPException(
                status_code=503,
                detail="Live train integration is not enabled"
            )
        
        # Load division to get stations map
        dataset = load_division_dataset(division.lower())
        stations_df = dataset.get("stations")
        stations_list = normalize_stations(stations_df) if stations_df is not None and not stations_df.empty else []
        stations_map = {s["code"]: s for s in stations_list}
        
        sync_result = await live_engine.sync_train(train_no, stations_map)
        
        return sync_result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing train {train_no}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to sync train: {str(e)}")

