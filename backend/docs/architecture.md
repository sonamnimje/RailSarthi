**Digital Twin Architecture**

This document describes the digital twin schema, loader, simulation and recommendation components added to RailSarthi.

**Twin Schema (Pydantic)**
- `Station` : `station_id`, `name`, `lat`, `lon`, `platforms`
- `Section` : `section_id`, `from_station`, `to_station`, `length_km`, `speed_limit_kmph`
- `Division` : `division_id`, `name`, `stations`, `sections`
- `TwinGraph` : `division`, `adjacency`

Files added:
- `app/core/twin_schema.py` — Pydantic models for the twin representation.
- `app/services/digital_twin_loader.py` — CSV/JSON loader that builds a `TwinGraph` from `app/data/<division>/` with a small TTL cache.
- `app/services/recommendation_engine.py` — Rule-based conflict detector and recommendation generator.
- `app/api/routes/recommendations.py` — API endpoint at `/api/recommendations` to return recommendations for a provided timeline or scenario.

ERD (simplified):

- Division 1 ---< Station (station_id)
- Division 1 ---< Section (section_id: from->to)

Simulation flow:
- Load twin via `TwinLoader.load_division(division)`
- Run `SimulatorService.run(scenario)` (lightweight, deterministic)
- Convert simulation output to timelines
- Run `recommendation_engine.make_recommendations(timelines)` to get recommendations

Next steps:
- Hook frontend to call `/api/recommendations` with timeline data from master-chart
- Improve loader to support JSON twin exports and persistent DB-backed twin storage