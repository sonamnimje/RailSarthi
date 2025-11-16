from fastapi import APIRouter, Body
from typing import Dict, Any

from app.services.recommendation_engine import make_recommendations
from app.services.simulator import simulator_service

router = APIRouter()


@router.post("/", tags=["recommendations"])
def recommend(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Accepts either a precomputed timeline or a scenario to simulate and returns recommendations."""
    # If timelines provided, use directly
    timelines = payload.get("timelines")
    if timelines is None:
        # fallback: run a quick simulation using simulator_service
        scenario = payload.get("scenario", {"disruptions": []})
        sim = simulator_service.run(scenario)
        # Build a minimal timeline structure from simulation predictions
        timelines = {}
        for t in sim.get("impacted_trains", []):
            timelines[t] = [{
                "section_id": "unknown",
                "enter_ts": 0,
                "exit_ts": 60 * 10
            }]

    recs = make_recommendations(timelines)
    return {"ok": True, "result": recs}
