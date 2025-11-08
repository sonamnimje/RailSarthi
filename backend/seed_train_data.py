#!/usr/bin/env python3
"""
Simple script to seed the database with sample train data for testing
"""
import sys
import os
from datetime import datetime, timedelta, timezone
import random

# Add the app directory to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from db.session import get_db
from db.models import Train, Station, TrainSchedule, TrainLog, TrainPosition
from sqlalchemy.orm import Session

def seed_data():
    db = next(get_db())
    
    try:
        # Create sample trains
        trains = [
            Train(id="T001", class_type="Express"),
            Train(id="T002", class_type="Local"),
            Train(id="T003", class_type="Freight"),
            Train(id="T004", class_type="Express"),
            Train(id="T005", class_type="Local"),
        ]
        
        for train in trains:
            db.merge(train)
        
        # Create sample stations
        stations = [
            Station(id="ST001", name="Central Station", section_id="S1"),
            Station(id="ST002", name="North Terminal", section_id="S1"),
            Station(id="ST003", name="South Junction", section_id="S2"),
            Station(id="ST004", name="East Platform", section_id="S2"),
            Station(id="ST005", name="West Gate", section_id="S3"),
        ]
        
        for station in stations:
            db.merge(station)
        
        # Create sample schedules
        now = datetime.now(timezone.utc)
        schedules = []
        
        for i, train in enumerate(trains):
            for j, station in enumerate(stations):
                # Create arrival and departure times within the last 24 hours and some in the future
                # Mix of past (for logs) and future (for upcoming schedules)
                hours_offset = random.choice([
                    -random.uniform(0, 24),  # Past 24 hours
                    random.uniform(0, 12)     # Next 12 hours
                ])
                base_time = now + timedelta(hours=hours_offset + i*0.5 + j*0.2)
                arrival_time = base_time
                departure_time = base_time + timedelta(minutes=5)
                
                # Add some randomness for delays
                delay_minutes = random.randint(0, 15) if random.random() < 0.3 else 0
                actual_arrival = arrival_time + timedelta(minutes=delay_minutes)
                actual_departure = departure_time + timedelta(minutes=delay_minutes)
                
                status = "delayed" if delay_minutes > 0 else "arrived" if j > 0 else "scheduled"
                
                schedule = TrainSchedule(
                    train_id=train.id,
                    station_id=station.id,
                    planned_arrival=arrival_time,
                    planned_departure=departure_time,
                    actual_arrival=actual_arrival,
                    actual_departure=actual_departure,
                    planned_platform=f"P{j+1}",
                    actual_platform=f"P{j+1}",
                    status=status,
                    delay_minutes=delay_minutes
                )
                schedules.append(schedule)
        
        for schedule in schedules:
            db.add(schedule)
        
        # Create sample train logs (within last 24 hours so they show up in the logs page)
        logs = []
        for i, train in enumerate(trains):
            for j, station in enumerate(stations):
                # Generate timestamps within the last 24 hours
                hours_ago = random.uniform(0, 24)
                base_time = now - timedelta(hours=hours_ago, minutes=random.randint(0, 59))
                
                # Arrival log
                arrival_log = TrainLog(
                    train_id=train.id,
                    station_id=station.id,
                    section_id=station.section_id,
                    event_type="arrival",
                    planned_time=base_time,
                    actual_time=base_time + timedelta(minutes=random.randint(0, 10)),
                    delay_minutes=random.randint(0, 10) if random.random() < 0.3 else 0,
                    status="arrived",
                    platform=f"P{j+1}",
                    notes=f"Arrived at {station.name}",
                    timestamp=base_time + timedelta(minutes=random.randint(0, 10))
                )
                logs.append(arrival_log)
                
                # Departure log
                departure_log = TrainLog(
                    train_id=train.id,
                    station_id=station.id,
                    section_id=station.section_id,
                    event_type="departure",
                    planned_time=base_time + timedelta(minutes=5),
                    actual_time=base_time + timedelta(minutes=5 + random.randint(0, 5)),
                    delay_minutes=random.randint(0, 5) if random.random() < 0.2 else 0,
                    status="departed",
                    platform=f"P{j+1}",
                    notes=f"Departed from {station.name}",
                    timestamp=base_time + timedelta(minutes=5 + random.randint(0, 5))
                )
                logs.append(departure_log)
        
        for log in logs:
            db.add(log)
        
        # Create sample train positions (within last 24 hours)
        positions = []
        for i, train in enumerate(trains):
            for j in range(10):  # 10 position updates per train
                hours_ago = random.uniform(0, 24)
                position = TrainPosition(
                    train_id=train.id,
                    section_id=f"S{(j % 3) + 1}",
                    planned_block_id=f"B{j}",
                    actual_block_id=f"B{j}",
                    location_km=float(j * 5.2),
                    speed_kmph=float(random.randint(40, 120)),
                    timestamp=now - timedelta(hours=hours_ago, minutes=j*10)
                )
                positions.append(position)
        
        for position in positions:
            db.add(position)
        
        db.commit()
        print("Successfully seeded database with sample train data")
        print(f"   - {len(trains)} trains")
        print(f"   - {len(stations)} stations")
        print(f"   - {len(schedules)} schedules")
        print(f"   - {len(logs)} train logs")
        print(f"   - {len(positions)} train positions")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
