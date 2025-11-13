#!/usr/bin/env python3
"""Seed demo data for Reports endpoints.

This script inserts a small set of trains, stations, train_positions and train_logs
so that the Reports API endpoints return meaningful demo data locally.

Run from repository root (pwsh):
python .\backend\scripts\seed_demo_reports.py

The script uses the project's SQLAlchemy engine and session helpers.
"""
import sys
import random
from datetime import datetime, timedelta, timezone

# Ensure backend package dir is on path so we can import app.* modules
from pathlib import Path
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.db.session import engine, get_db_session
from app.db.models import Base, Train, Station, TrainPosition, TrainLog


def create_schema() -> None:
    print("Ensuring database schema exists...")
    Base.metadata.create_all(bind=engine)


def seed_demo(count_trains: int = 12):
    now = datetime.now(timezone.utc)

    stations = [
        Station(id=f"S{i}", name=f"Station {i}", section_id=f"SEC{(i%4)+1}")
        for i in range(1, 6)
    ]

    train_types = ["Express", "Freight", "Local"]
    trains = [Train(id=f"T{i:03}", class_type=random.choice(train_types)) for i in range(1, count_trains + 1)]

    with get_db_session() as db:
        # Upsert stations & trains using merge() so rerunning is safe
        for s in stations:
            db.merge(s)
        for t in trains:
            db.merge(t)

        # Insert position events and logs over the last 24 hours
        for hour_offset in range(0, 24, 2):
            ts = now - timedelta(hours=hour_offset)
            sample_trains = random.sample(trains, k=min(6, len(trains)))
            for tr in sample_trains:
                section = random.choice(stations).section_id
                pos = TrainPosition(
                    train_id=tr.id,
                    section_id=section,
                    planned_block_id=None,
                    actual_block_id=None,
                    location_km=round(random.uniform(0, 200), 2),
                    speed_kmph=round(random.uniform(10, 120), 1),
                    timestamp=ts,
                )
                db.add(pos)

                # Create a corresponding TrainLog (arrival/departure) with some delays
                delay = random.choice([0, 0, 0, 3, 5, 10, 20])
                log = TrainLog(
                    train_id=tr.id,
                    station_id=random.choice(stations).id,
                    section_id=section,
                    event_type=random.choice(["arrival", "departure"]),
                    planned_time=(ts - timedelta(minutes=delay)) if delay else (ts - timedelta(minutes=1)),
                    actual_time=ts,
                    delay_minutes=delay,
                    status="arrived" if random.random() > 0.2 else "delayed",
                    platform=str(random.randint(1, 12)),
                    notes=None,
                    timestamp=ts,
                )
                db.add(log)

        db.commit()

        # Print summary counts
        pos_count = db.query(TrainPosition).count()
        log_count = db.query(TrainLog).count()
        train_count = db.query(Train).count()
        station_count = db.query(Station).count()

        print(f"Seeded trains: {train_count}, stations: {station_count}, positions: {pos_count}, logs: {log_count}")


if __name__ == "__main__":
    create_schema()
    seed_demo()
    print("Done. Start the backend and open Reports page to view demo charts.")
