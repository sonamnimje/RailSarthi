from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from pydantic import BaseModel
from .users import require_role
from app.db.session import get_db
from app.db.models import TrainLog, TrainSchedule, Train, Station
from app.services.rapidapi_client import RapidAPIClient
from app.services.fetch_rapidapi_trains import (
    fetch_and_insert_rapidapi_status,
    fetch_and_insert_rapidapi_schedule,
    sync_multiple_trains_rapidapi
)

# Temporarily remove authentication for testing
# router = APIRouter(dependencies=[Depends(require_role("controller", "admin"))])
router = APIRouter()


class SyncRapidAPIRequest(BaseModel):
    train_numbers: List[str]
    start_day: int = 1


@router.get("/logs")
async def get_train_logs(
    train_id: Optional[str] = Query(None, description="Filter by train ID"),
    section_id: Optional[str] = Query(None, description="Filter by section ID"),
    station_id: Optional[str] = Query(None, description="Filter by station ID"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records"),
    sync_rapidapi: bool = Query(False, description="Sync from RapidAPI if train_id is provided and no recent data found"),
    db: Session = Depends(get_db)
) -> dict:
    """Get train logs with filtering options. Optionally sync from RapidAPI if data is missing."""
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    query = db.query(TrainLog).filter(TrainLog.timestamp >= start_time)
    
    if train_id:
        query = query.filter(TrainLog.train_id.ilike(f"%{train_id}%"))
    if section_id:
        query = query.filter(TrainLog.section_id.ilike(f"%{section_id}%"))
    if station_id:
        query = query.filter(TrainLog.station_id.ilike(f"%{station_id}%"))
    if event_type:
        query = query.filter(TrainLog.event_type == event_type)
    
    logs = query.order_by(TrainLog.timestamp.desc()).limit(limit).all()
    
    # If sync_rapidapi is enabled and we have a train_id but no recent logs, fetch from RapidAPI
    if sync_rapidapi and train_id and len(logs) == 0:
        try:
            # Try to sync this train from RapidAPI
            result = await fetch_and_insert_rapidapi_status(train_id, start_day=1)
            # Re-query after sync
            logs = query.order_by(TrainLog.timestamp.desc()).limit(limit).all()
        except Exception as e:
            # If sync fails, continue with empty results
            pass
    
    return {
        "logs": [
            {
                "id": log.id,
                "train_id": log.train_id,
                "station_id": log.station_id,
                "section_id": log.section_id,
                "event_type": log.event_type,
                "planned_time": log.planned_time.isoformat() if log.planned_time else None,
                "actual_time": log.actual_time.isoformat() if log.actual_time else None,
                "delay_minutes": log.delay_minutes,
                "status": log.status,
                "platform": log.platform,
                "notes": log.notes,
                "timestamp": log.timestamp.isoformat()
            }
            for log in logs
        ],
        "total": len(logs)
    }


@router.get("/schedules")
async def get_train_schedules(
    train_id: Optional[str] = Query(None, description="Filter by train ID"),
    station_id: Optional[str] = Query(None, description="Filter by station ID"),
    section_id: Optional[str] = Query(None, description="Filter by section ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records"),
    sync_rapidapi: bool = Query(False, description="Sync from RapidAPI if train_id is provided and no recent data found"),
    db: Session = Depends(get_db)
) -> dict:
    """Get train schedules with actual vs planned times. Optionally sync from RapidAPI if data is missing."""
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    # Join with Station table to support section_id filtering
    query = db.query(TrainSchedule)
    
    # If filtering by section_id, we need to join with Station
    # Use outerjoin to include schedules even if station doesn't exist
    if section_id:
        query = query.outerjoin(Station, TrainSchedule.station_id == Station.id)
    
    query = query.filter(
        or_(
            TrainSchedule.planned_arrival >= start_time,
            TrainSchedule.actual_arrival >= start_time
        )
    )
    
    if train_id:
        query = query.filter(TrainSchedule.train_id.ilike(f"%{train_id}%"))
    if station_id:
        query = query.filter(TrainSchedule.station_id.ilike(f"%{station_id}%"))
    if section_id:
        query = query.filter(Station.section_id.ilike(f"%{section_id}%"))
    if status:
        query = query.filter(TrainSchedule.status == status)
    
    schedules = query.order_by(TrainSchedule.planned_arrival.desc()).limit(limit).all()
    
    # If sync_rapidapi is enabled and we have a train_id but no recent schedules, fetch from RapidAPI
    if sync_rapidapi and train_id and len(schedules) == 0:
        try:
            # Try to sync schedule and status for this train from RapidAPI
            await fetch_and_insert_rapidapi_schedule(train_id)
            await fetch_and_insert_rapidapi_status(train_id, start_day=1)
            # Re-query after sync
            schedules = query.order_by(TrainSchedule.planned_arrival.desc()).limit(limit).all()
        except Exception as e:
            # If sync fails, continue with empty results
            pass
    
    return {
        "schedules": [
            {
                "id": schedule.id,
                "train_id": schedule.train_id,
                "station_id": schedule.station_id,
                "planned_arrival": schedule.planned_arrival.isoformat() if schedule.planned_arrival else None,
                "actual_arrival": schedule.actual_arrival.isoformat() if schedule.actual_arrival else None,
                "planned_departure": schedule.planned_departure.isoformat() if schedule.planned_departure else None,
                "actual_departure": schedule.actual_departure.isoformat() if schedule.actual_departure else None,
                "planned_platform": schedule.planned_platform,
                "actual_platform": schedule.actual_platform,
                "status": schedule.status,
                "delay_minutes": schedule.delay_minutes
            }
            for schedule in schedules
        ],
        "total": len(schedules)
    }


@router.get("/timeline")
def get_timeline_data(
    train_id: Optional[str] = Query(None, description="Filter by train ID"),
    section_id: Optional[str] = Query(None, description="Filter by section ID"),
    hours: int = Query(12, ge=1, le=168, description="Hours to look back"),
    db: Session = Depends(get_db)
) -> dict:
    """Get timeline data for Gantt-style visualization"""
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    # Get train movements with planned vs actual times
    query = db.query(
        TrainLog.train_id,
        TrainLog.station_id,
        TrainLog.section_id,
        TrainLog.event_type,
        TrainLog.planned_time,
        TrainLog.actual_time,
        TrainLog.delay_minutes,
        TrainLog.status,
        TrainLog.platform
    ).filter(
        TrainLog.timestamp >= start_time
    )
    
    if train_id:
        query = query.filter(TrainLog.train_id.ilike(f"%{train_id}%"))
    if section_id:
        query = query.filter(TrainLog.section_id.ilike(f"%{section_id}%"))
    
    movements = query.order_by(TrainLog.train_id, TrainLog.timestamp).all()
    
    # Group by train for timeline visualization
    timeline_data = {}
    for movement in movements:
        train_id = movement.train_id
        if train_id not in timeline_data:
            timeline_data[train_id] = []
        
        timeline_data[train_id].append({
            "station_id": movement.station_id,
            "section_id": movement.section_id,
            "event_type": movement.event_type,
            "planned_time": movement.planned_time.isoformat() if movement.planned_time else None,
            "actual_time": movement.actual_time.isoformat() if movement.actual_time else None,
            "delay_minutes": movement.delay_minutes,
            "status": movement.status,
            "platform": movement.platform
        })
    
    return {
        "timeline": timeline_data,
        "time_range": {
            "start": start_time.isoformat(),
            "end": now.isoformat()
        }
    }


@router.get("/stats")
def get_log_stats(
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
    db: Session = Depends(get_db)
) -> dict:
    """Get statistics about train logs and schedules"""
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    # Total logs in time period
    total_logs = db.query(func.count(TrainLog.id)).filter(
        TrainLog.timestamp >= start_time
    ).scalar()
    
    # Delayed trains
    delayed_trains = db.query(func.count(func.distinct(TrainLog.train_id))).filter(
        and_(
            TrainLog.timestamp >= start_time,
            TrainLog.delay_minutes > 0
        )
    ).scalar()
    
    # Average delay
    avg_delay = db.query(func.avg(TrainLog.delay_minutes)).filter(
        and_(
            TrainLog.timestamp >= start_time,
            TrainLog.delay_minutes > 0
        )
    ).scalar()
    
    # On-time percentage
    total_schedules = db.query(func.count(TrainSchedule.id)).filter(
        or_(
            TrainSchedule.planned_arrival >= start_time,
            TrainSchedule.actual_arrival >= start_time
        )
    ).scalar()
    
    on_time_schedules = db.query(func.count(TrainSchedule.id)).filter(
        and_(
            or_(
                TrainSchedule.planned_arrival >= start_time,
                TrainSchedule.actual_arrival >= start_time
            ),
            or_(
                TrainSchedule.delay_minutes == 0,
                TrainSchedule.delay_minutes.is_(None)
            )
        )
    ).scalar()
    
    on_time_percentage = (on_time_schedules / total_schedules * 100) if total_schedules > 0 else 0
    
    return {
        "total_logs": total_logs or 0,
        "delayed_trains": delayed_trains or 0,
        "average_delay_minutes": round(avg_delay or 0, 1),
        "on_time_percentage": round(on_time_percentage, 1),
        "total_schedules": total_schedules or 0
    }


@router.get("/schedule/rapidapi")
async def get_train_schedule_rapidapi(
    trainNo: str = Query(..., description="Train number to get schedule for")
) -> dict:
    """Get train schedule (timetable) from RapidAPI IRCTC endpoint.
    
    Returns the official timetable with planned stops, timings, and distances.
    This shows what the train is supposed to do as per Indian Railways' official timetable.
    """
    try:
        client = RapidAPIClient()
        schedule_data = await client.get_train_schedule(trainNo)
        return {
            "trainNo": trainNo,
            "schedule": schedule_data,
            "source": "rapidapi_irctc",
            "type": "schedule"
        }
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch train schedule: {str(e)}")


@router.get("/status/rapidapi")
async def get_live_train_status_rapidapi(
    trainNo: str = Query(..., description="Train number to get live status for"),
    startDay: int = Query(1, ge=1, le=7, description="Day of journey (1 = same day, 2 = next day, etc.)"),
    sync_to_db: bool = Query(False, description="Also sync the fetched data to database")
) -> dict:
    """Get live train status (real-time running info) from RapidAPI IRCTC endpoint.
    
    Returns current position, delays, actual arrival/departure times, and movement logs.
    This shows actual movement and real-time running updates.
    
    If sync_to_db is True, the data will also be stored in the database.
    """
    try:
        client = RapidAPIClient()
        status_data = await client.get_live_train_status(trainNo, startDay)
        
        # Optionally sync to database
        sync_result = None
        if sync_to_db:
            sync_result = await fetch_and_insert_rapidapi_status(trainNo, startDay)
        
        return {
            "trainNo": trainNo,
            "startDay": startDay,
            "status": status_data,
            "source": "rapidapi_irctc",
            "type": "live_status",
            "synced_to_db": sync_to_db,
            "sync_result": sync_result
        }
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch live train status: {str(e)}")


@router.post("/sync/rapidapi")
async def sync_rapidapi_data(
    request: SyncRapidAPIRequest,
    background_tasks: BackgroundTasks = None
) -> dict:
    """Sync live train status from RapidAPI for multiple trains and store in database.
    
    This endpoint fetches live status from RapidAPI and stores it in the database
    as TrainLog and TrainSchedule entries.
    
    Request body:
    - train_numbers: List of train numbers to sync
    - start_day: Day of journey (1 = same day, 2 = next day, etc.), default 1
    """
    try:
        if not (1 <= request.start_day <= 7):
            raise HTTPException(status_code=400, detail="start_day must be between 1 and 7")
        
        result = await sync_multiple_trains_rapidapi(request.train_numbers, request.start_day)
        return {
            "success": True,
            "message": f"Synced {len(request.train_numbers)} trains from RapidAPI",
            "logs_inserted": result["total_logs_inserted"],
            "schedules_inserted": result["total_schedules_inserted"],
            "trains_processed": result["trains_processed"],
            "errors": result["errors"][:10]  # Limit errors in response
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync RapidAPI data: {str(e)}")


@router.post("/sync/rapidapi/status")
async def sync_single_train_status(
    trainNo: str = Query(..., description="Train number to sync"),
    startDay: int = Query(1, ge=1, le=7, description="Day of journey (1 = same day, 2 = next day, etc.)")
) -> dict:
    """Sync live train status from RapidAPI for a single train and store in database."""
    try:
        result = await fetch_and_insert_rapidapi_status(trainNo, startDay)
        return {
            "success": True,
            "trainNo": trainNo,
            "logs_inserted": result["logs_inserted"],
            "schedules_inserted": result["schedules_inserted"],
            "errors": result["errors"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync train status: {str(e)}")


@router.post("/sync/rapidapi/schedule")
async def sync_single_train_schedule(
    trainNo: str = Query(..., description="Train number to sync schedule for")
) -> dict:
    """Sync train schedule (timetable) from RapidAPI for a single train and store in database."""
    try:
        result = await fetch_and_insert_rapidapi_schedule(trainNo)
        return {
            "success": True,
            "trainNo": trainNo,
            "schedules_inserted": result["schedules_inserted"],
            "errors": result["errors"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync train schedule: {str(e)}")


@router.get("/station/live/rapidapi")
async def get_live_station_rapidapi(
    fromStationCode: str = Query(..., description="Source station code (e.g., NDLS)"),
    toStationCode: str = Query(..., description="Destination station code (e.g., BCT)"),
    hours: int = Query(8, ge=1, le=24, description="Number of hours to look ahead")
) -> dict:
    """Get live station data from RapidAPI IRCTC endpoint.
    
    Returns real-time train movements at a station, showing trains arriving/departing
    within the specified time window.
    """
    try:
        client = RapidAPIClient()
        station_data = await client.get_live_station(fromStationCode, toStationCode, hours)
        return {
            "fromStationCode": fromStationCode,
            "toStationCode": toStationCode,
            "hours": hours,
            "data": station_data,
            "source": "rapidapi_irctc",
            "type": "live_station"
        }
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch live station data: {str(e)}")


@router.get("/trains/between-stations/rapidapi")
async def get_trains_between_stations_rapidapi(
    fromStationCode: str = Query(..., description="Source station code (e.g., NDLS)"),
    toStationCode: str = Query(..., description="Destination station code (e.g., BCT)"),
    date: Optional[str] = Query(None, description="Date in format YYYY-MM-DD (optional, defaults to today)")
) -> dict:
    """Get trains between two stations from RapidAPI IRCTC endpoint.
    
    Returns list of trains running between source and destination stations,
    including train numbers, names, departure/arrival times, and availability.
    """
    try:
        client = RapidAPIClient()
        trains_data = await client.get_trains_between_stations(fromStationCode, toStationCode, date)
        return {
            "fromStationCode": fromStationCode,
            "toStationCode": toStationCode,
            "date": date,
            "trains": trains_data,
            "source": "rapidapi_irctc",
            "type": "trains_between_stations"
        }
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch trains between stations: {str(e)}")
