"""
Service to fetch live train status from RapidAPI IRCTC and store in database.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

from ..core.config import settings
from ..services.rapidapi_client import get_rapidapi_client
from ..db.session import SessionLocal, get_db_session
from ..db.models import TrainLog, TrainSchedule, Train, Station


def _ensure_train_and_station(db, train_id: str, station_code: Optional[str], station_name: Optional[str] = None) -> None:
	"""Ensure train and station exist in database."""
	if not db.query(Train).filter(Train.id == train_id).first():
		db.add(Train(id=train_id, class_type=None))
	if station_code:
		existing_station = db.query(Station).filter(Station.id == station_code).first()
		if not existing_station:
			db.add(Station(id=station_code, name=station_name or station_code, section_id=None))


def _parse_datetime_from_rapidapi(dt_str: Optional[str]) -> Optional[datetime]:
	"""Parse datetime from RapidAPI response format."""
	if not dt_str:
		return None
	try:
		# Try ISO format first
		if 'T' in dt_str:
			return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
		# Try common formats: "DD-MM-YYYY HH:MM:SS" or "HH:MM"
		parts = dt_str.strip().split()
		if len(parts) == 2:
			date_part, time_part = parts
			dd, mm, yyyy = date_part.split('-')
			hh, mins, secs = time_part.split(':') if ':' in time_part else (time_part[:2], time_part[2:4], '00')
			return datetime(int(yyyy), int(mm), int(dd), int(hh), int(mins), int(secs), tzinfo=timezone.utc)
		# Try just time "HH:MM"
		if ':' in dt_str and len(dt_str) <= 5:
			hh, mins = dt_str.split(':')
			now = datetime.now(timezone.utc)
			return now.replace(hour=int(hh), minute=int(mins), second=0, microsecond=0)
	except Exception:
		pass
	return None


def _calculate_delay_minutes(planned: Optional[datetime], actual: Optional[datetime]) -> Optional[int]:
	"""Calculate delay in minutes."""
	if planned and actual:
		try:
			delay_seconds = (actual - planned).total_seconds()
			return int(delay_seconds / 60)
		except Exception:
			pass
	return None


def _is_duplicate_log(db, train_id: str, station_id: str, event_type: str, timestamp: datetime, window_minutes: int = 5) -> bool:
	"""Check if a similar log entry exists within the dedupe window."""
	cutoff = timestamp - timedelta(minutes=window_minutes)
	existing = (
		db.query(TrainLog)
		.filter(TrainLog.train_id == train_id)
		.filter(TrainLog.station_id == station_id)
		.filter(TrainLog.event_type == event_type)
		.filter(TrainLog.timestamp >= cutoff)
		.order_by(TrainLog.id.desc())
		.first()
	)
	return existing is not None


async def fetch_and_insert_rapidapi_status(
	train_no: str,
	start_day: int = 1,
	dedupe_window_min: int = 5
) -> Dict[str, Any]:
	"""
	Fetch live train status from RapidAPI and insert into database.
	
	Returns dict with:
		- logs_inserted: number of TrainLog entries created
		- schedules_inserted: number of TrainSchedule entries created
		- errors: list of error messages
	"""
	result = {
		"logs_inserted": 0,
		"schedules_inserted": 0,
		"errors": []
	}
	
	from app.services.rapidapi_client import get_rapidapi_client
	client = get_rapidapi_client()
	
	try:
		# Fetch live status from RapidAPI
		status_data = await client.get_live_train_status(train_no, start_day)
		
		if not isinstance(status_data, dict):
			result["errors"].append(f"Invalid response format for train {train_no}")
			return result
		
		with get_db_session() as db:
			# Parse the response - RapidAPI IRCTC typically returns data in this structure:
			# {
			#   "trainNo": "...",
			#   "trainName": "...",
			#   "currentStatus": {...},
			#   "route": [...],
			#   "stations": [...]
			# }
			
			# Try to find route/stations data
			route = status_data.get("route") or status_data.get("stations") or status_data.get("stops") or []
			if not isinstance(route, list):
				route = []
			
			# Get current status info
			current_status = status_data.get("currentStatus") or status_data.get("status") or {}
			if isinstance(current_status, dict):
				current_station_code = (
					current_status.get("stationCode") or
					current_status.get("station_code") or
					current_status.get("code") or
					None
				)
				current_station_name = (
					current_status.get("stationName") or
					current_status.get("station_name") or
					current_status.get("name") or
					None
				)
			else:
				current_station_code = None
				current_station_name = None
			
			# Process each station in the route
			for station_data in route:
				if not isinstance(station_data, dict):
					continue
				
				# Extract station info
				station_code = (
					station_data.get("stationCode") or
					station_data.get("station_code") or
					station_data.get("code") or
					station_data.get("stnCode") or
					None
				)
				station_name = (
					station_data.get("stationName") or
					station_data.get("station_name") or
					station_data.get("name") or
					station_code
				)
				
				if not station_code:
					continue
				
				_ensure_train_and_station(db, train_no, station_code, station_name)
				
				# Parse arrival times
				arrival_planned_str = (
					station_data.get("arrivalTime") or
					station_data.get("arrival_time") or
					station_data.get("scheduledArrival") or
					station_data.get("arrival") or
					None
				)
				arrival_actual_str = (
					station_data.get("actualArrivalTime") or
					station_data.get("actual_arrival_time") or
					station_data.get("actualArrival") or
					station_data.get("actual_arrival") or
					None
				)
				
				planned_arrival = _parse_datetime_from_rapidapi(arrival_planned_str)
				actual_arrival = _parse_datetime_from_rapidapi(arrival_actual_str) or planned_arrival
				
				# Parse departure times
				departure_planned_str = (
					station_data.get("departureTime") or
					station_data.get("departure_time") or
					station_data.get("scheduledDeparture") or
					station_data.get("departure") or
					None
				)
				departure_actual_str = (
					station_data.get("actualDepartureTime") or
					station_data.get("actual_departure_time") or
					station_data.get("actualDeparture") or
					station_data.get("actual_departure") or
					None
				)
				
				planned_departure = _parse_datetime_from_rapidapi(departure_planned_str)
				actual_departure = _parse_datetime_from_rapidapi(departure_actual_str) or planned_departure
				
				# Get platform info
				platform = (
					station_data.get("platform") or
					station_data.get("platformNo") or
					station_data.get("platform_no") or
					None
				)
				if platform:
					platform = str(platform)
				
				# Get status
				status = (
					station_data.get("status") or
					station_data.get("trainStatus") or
					"running"
				)
				
				# Calculate delays
				arrival_delay = _calculate_delay_minutes(planned_arrival, actual_arrival) or 0
				departure_delay = _calculate_delay_minutes(planned_departure, actual_departure) or 0
				
				now = datetime.now(timezone.utc)
				
				# Create TrainLog entries for arrival
				if planned_arrival or actual_arrival:
					if not _is_duplicate_log(db, train_no, station_code, "arrival", now, dedupe_window_min):
						log_arrival = TrainLog(
							train_id=train_no,
							station_id=station_code,
							section_id=station_data.get("section_id") or "",
							event_type="arrival",
							planned_time=planned_arrival,
							actual_time=actual_arrival,
							delay_minutes=arrival_delay,
							status=status,
							platform=platform,
							notes=f"RapidAPI live status - {station_name}",
							timestamp=now
						)
						db.add(log_arrival)
						result["logs_inserted"] += 1
				
				# Create TrainLog entries for departure
				if planned_departure or actual_departure:
					if not _is_duplicate_log(db, train_no, station_code, "departure", now, dedupe_window_min):
						log_departure = TrainLog(
							train_id=train_no,
							station_id=station_code,
							section_id=station_data.get("section_id") or "",
							event_type="departure",
							planned_time=planned_departure,
							actual_time=actual_departure,
							delay_minutes=departure_delay,
							status=status,
							platform=platform,
							notes=f"RapidAPI live status - {station_name}",
							timestamp=now
						)
						db.add(log_departure)
						result["logs_inserted"] += 1
				
				# Create or update TrainSchedule entry
				# Check if schedule exists
				existing_schedule = (
					db.query(TrainSchedule)
					.filter(TrainSchedule.train_id == train_no)
					.filter(TrainSchedule.station_id == station_code)
					.first()
				)
				
				if existing_schedule:
					# Update existing schedule
					existing_schedule.planned_arrival = planned_arrival or existing_schedule.planned_arrival
					existing_schedule.actual_arrival = actual_arrival or existing_schedule.actual_arrival
					existing_schedule.planned_departure = planned_departure or existing_schedule.planned_departure
					existing_schedule.actual_departure = actual_departure or existing_schedule.actual_departure
					existing_schedule.planned_platform = platform or existing_schedule.planned_platform
					existing_schedule.actual_platform = platform or existing_schedule.actual_platform
					existing_schedule.status = status or existing_schedule.status
					existing_schedule.delay_minutes = max(arrival_delay, departure_delay) if (arrival_delay or departure_delay) else existing_schedule.delay_minutes
				else:
					# Create new schedule
					schedule = TrainSchedule(
						train_id=train_no,
						station_id=station_code,
						planned_arrival=planned_arrival,
						actual_arrival=actual_arrival,
						planned_departure=planned_departure,
						actual_departure=actual_departure,
						planned_platform=platform,
						actual_platform=platform,
						status=status,
						delay_minutes=max(arrival_delay, departure_delay) if (arrival_delay or departure_delay) else 0
					)
					db.add(schedule)
					result["schedules_inserted"] += 1
			
			db.commit()
			
	except Exception as e:
		result["errors"].append(f"Error processing train {train_no}: {str(e)}")
	
	return result


async def fetch_and_insert_rapidapi_schedule(train_no: str) -> Dict[str, Any]:
	"""
	Fetch train schedule (timetable) from RapidAPI and insert into database.
	
	Returns dict with:
		- schedules_inserted: number of TrainSchedule entries created
		- errors: list of error messages
	"""
	result = {
		"schedules_inserted": 0,
		"errors": []
	}
	
	from app.services.rapidapi_client import get_rapidapi_client
	client = get_rapidapi_client()
	
	try:
		# Fetch schedule from RapidAPI
		schedule_data = await client.get_train_schedule(train_no)
		
		if not isinstance(schedule_data, dict):
			result["errors"].append(f"Invalid response format for train {train_no}")
			return result
		
		with get_db_session() as db:
			# Parse schedule data
			route = schedule_data.get("route") or schedule_data.get("stations") or schedule_data.get("stops") or []
			if not isinstance(route, list):
				route = []
			
			for station_data in route:
				if not isinstance(station_data, dict):
					continue
				
				station_code = (
					station_data.get("stationCode") or
					station_data.get("station_code") or
					station_data.get("code") or
					station_data.get("stnCode") or
					None
				)
				station_name = (
					station_data.get("stationName") or
					station_data.get("station_name") or
					station_data.get("name") or
					station_code
				)
				
				if not station_code:
					continue
				
				_ensure_train_and_station(db, train_no, station_code, station_name)
				
				# Parse times from schedule (these are planned times)
				planned_arrival = _parse_datetime_from_rapidapi(
					station_data.get("arrivalTime") or
					station_data.get("arrival_time") or
					station_data.get("scheduledArrival") or
					station_data.get("arrival")
				)
				planned_departure = _parse_datetime_from_rapidapi(
					station_data.get("departureTime") or
					station_data.get("departure_time") or
					station_data.get("scheduledDeparture") or
					station_data.get("departure")
				)
				
				platform = (
					station_data.get("platform") or
					station_data.get("platformNo") or
					station_data.get("platform_no") or
					None
				)
				if platform:
					platform = str(platform)
				
				# Check if schedule exists
				existing_schedule = (
					db.query(TrainSchedule)
					.filter(TrainSchedule.train_id == train_no)
					.filter(TrainSchedule.station_id == station_code)
					.first()
				)
				
				if existing_schedule:
					# Update planned times
					if planned_arrival:
						existing_schedule.planned_arrival = planned_arrival
					if planned_departure:
						existing_schedule.planned_departure = planned_departure
					if platform:
						existing_schedule.planned_platform = platform
				else:
					# Create new schedule
					schedule = TrainSchedule(
						train_id=train_no,
						station_id=station_code,
						planned_arrival=planned_arrival,
						planned_departure=planned_departure,
						planned_platform=platform,
						status="scheduled",
						delay_minutes=0
					)
					db.add(schedule)
					result["schedules_inserted"] += 1
			
			db.commit()
			
	except Exception as e:
		result["errors"].append(f"Error processing schedule for train {train_no}: {str(e)}")
	
	return result


async def sync_multiple_trains_rapidapi(train_numbers: List[str], start_day: int = 1) -> Dict[str, Any]:
	"""
	Sync multiple trains from RapidAPI.
	
	Returns summary of all operations.
	"""
	total_logs = 0
	total_schedules = 0
	all_errors = []
	
	for train_no in train_numbers:
		result = await fetch_and_insert_rapidapi_status(train_no, start_day)
		total_logs += result["logs_inserted"]
		total_schedules += result["schedules_inserted"]
		all_errors.extend(result["errors"])
	
	return {
		"total_logs_inserted": total_logs,
		"total_schedules_inserted": total_schedules,
		"trains_processed": len(train_numbers),
		"errors": all_errors
	}


def run_sync(train_numbers: List[str], start_day: int = 1) -> None:
	"""Synchronous entrypoint for CLI usage."""
	result = asyncio.run(sync_multiple_trains_rapidapi(train_numbers, start_day))
	print(f"✅ Inserted {result['total_logs_inserted']} logs and {result['total_schedules_inserted']} schedules")
	if result["errors"]:
		print(f"⚠ Errors: {len(result['errors'])}")
		for error in result["errors"][:5]:  # Show first 5 errors
			print(f"  - {error}")


if __name__ == "__main__":
	import sys
	trains_arg = []
	if len(sys.argv) >= 2:
		trains_arg = [t.strip() for t in sys.argv[1].split(",") if t.strip()]
	else:
		# Default test trains
		trains_arg = ["12301", "12302"]  # Example train numbers
	run_sync(trains_arg)

