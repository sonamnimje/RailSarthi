from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any
import uuid
import logging

from app.db.session import get_db_session
from app.db import models

logger = logging.getLogger(__name__)

router = APIRouter()


class OverrideIn(BaseModel):
    controller_id: str
    train_id: str
    action: str
    ai_action: str | None = None
    reason: str | None = None


@router.post("/api/ai/override")
def post_override(payload: OverrideIn):
    """Log a human override into the feedback DB and notify AI engine for learning."""
    record_id = str(uuid.uuid4())
    try:
        with get_db_session() as db:
            ov = models.AIOverride(
                override_id=record_id,
                division="",
                conflict_id="",
                ai_solution_json={"ai_action": payload.ai_action} if payload.ai_action else {},
                human_solution_json={"action": payload.action, "reason": payload.reason},
                user_id=payload.controller_id,
            )
            db.add(ov)
            db.commit()
    except Exception as e:
        logger.error(f"Failed to persist override: {e}")
        raise HTTPException(status_code=500, detail="Failed to store override")

    # If AI engine is available, inform it (best-effort; do not fail request)
    try:
        from app.services.ai_engine import RecommendationEngine
        engine = RecommendationEngine()
        engine.record_override({
            "override_id": record_id,
            "controller_id": payload.controller_id,
            "train_id": payload.train_id,
            "action": payload.action,
            "ai_action": payload.ai_action,
            "reason": payload.reason,
        })
    except Exception as e:
        logger.warning(f"AI engine not available to ingest override: {e}")

    return {"status": "ok", "override_id": record_id}
"""
AI Recommendation API Routes
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import logging
from datetime import datetime

# Twin manager removed - endpoints that require it are disabled
from app.services.ai_engine import RecommendationEngine, StateEncoder

router = APIRouter(prefix="/api/ai", tags=["ai"])

logger = logging.getLogger(__name__)

# Global AI engine instance (can be per-division in production)
_ai_engine: Optional[RecommendationEngine] = None
_state_encoder: Optional[StateEncoder] = None


def get_ai_engine() -> RecommendationEngine:
    """Get or create AI engine instance"""
    global _ai_engine
    if _ai_engine is None:
        _ai_engine = RecommendationEngine()
    return _ai_engine


def get_state_encoder() -> StateEncoder:
    """Get or create state encoder instance"""
    global _state_encoder
    if _state_encoder is None:
        _state_encoder = StateEncoder()
    return _state_encoder


class OverrideRequest(BaseModel):
    division: str
    recommendation_id: str
    user_id: Optional[str] = None
    human_solution: Dict[str, Any]
    reason: Optional[str] = None


class AcceptRequest(BaseModel):
    division: str
    recommendation_id: str
    user_id: Optional[str] = None


class RecommendationRequest(BaseModel):
    conflict_filter: Optional[Dict[str, Any]] = None


@router.post("/recommendation")
async def get_recommendation(
    division: str = Query(..., description="Division name"),
    request: RecommendationRequest = RecommendationRequest(),
):
    """
    Get AI recommendations - DISABLED: Digital twin removed
    """
    raise HTTPException(status_code=410, detail="Digital twin functionality has been removed")


@router.get("/recommendation/latest")
async def get_latest_recommendations(
    division: str = Query(..., description="Division name"),
):
    """Get latest recommendations - DISABLED: Digital twin removed"""
    return []


@router.post("/accept")
async def accept_recommendation(
    request: AcceptRequest,
):
    """
    Accept an AI recommendation - DISABLED: Digital twin removed
    """
    raise HTTPException(status_code=410, detail="Digital twin functionality has been removed")


@router.post("/override")
async def log_override(
    request: OverrideRequest,
):
    """
    Log a human override - DISABLED: Digital twin removed
    """
    raise HTTPException(status_code=410, detail="Digital twin functionality has been removed")


@router.get("/weights")
async def get_weights():
    """
    Get current AI model weights and fusion weights.
    """
    ai_engine = get_ai_engine()
    
    return {
        "or_weight": ai_engine.or_weight,
        "rl_weight": ai_engine.rl_weight,
        "gnn_weight": ai_engine.gnn_weight,
        "adaptive_weights": ai_engine.adaptive_weights,
        "fusion_weights": {
            "or": ai_engine.or_weight,
            "rl": ai_engine.rl_weight,
            "gnn": ai_engine.gnn_weight,
        }
    }


@router.post("/weights")
async def update_weights(
    or_weight: Optional[float] = Query(None),
    rl_weight: Optional[float] = Query(None),
    gnn_weight: Optional[float] = Query(None)
):
    """
    Update AI model weights (for fine-tuning).
    """
    ai_engine = get_ai_engine()
    
    if or_weight is not None:
        ai_engine.or_weight = max(0.0, min(1.0, or_weight))
    if rl_weight is not None:
        ai_engine.rl_weight = max(0.0, min(1.0, rl_weight))
    if gnn_weight is not None:
        ai_engine.gnn_weight = max(0.0, min(1.0, gnn_weight))
    
    # Normalize weights
    total = ai_engine.or_weight + ai_engine.rl_weight + ai_engine.gnn_weight
    if total > 0:
        ai_engine.or_weight /= total
        ai_engine.rl_weight /= total
        ai_engine.gnn_weight /= total
    
    return {
        "status": "success",
        "weights": {
            "or_weight": ai_engine.or_weight,
            "rl_weight": ai_engine.rl_weight,
            "gnn_weight": ai_engine.gnn_weight,
        }
    }


@router.get("/audit")
async def get_audit_logs(
    division: str = Query(..., description="Division name"),
    limit: int = Query(100, description="Number of logs to return")
):
    """
    Get audit logs for AI recommendations and overrides.
    """
    division_lower = division.lower()
    
    if division_lower not in ["mumbai", "pune", "bhusaval", "nagpur", "solapur"]:
        raise HTTPException(status_code=400, detail=f"Invalid division: {division}")
    
    # Get overrides from database
    try:
        from app.db.models import AIOverride
        from app.db.session import SessionLocal
        
        db = SessionLocal()
        overrides = db.query(AIOverride).filter(
            AIOverride.division == division_lower
        ).order_by(AIOverride.timestamp.desc()).limit(limit).all()
        
        logs = []
        for override in overrides:
            logs.append({
                "override_id": override.override_id,
                "timestamp": override.timestamp.isoformat(),
                "conflict_id": override.conflict_id,
                "user_id": override.user_id,
                "reason": override.reason,
            })
        
        db.close()
        return {"logs": logs, "count": len(logs)}
    except Exception as e:
        logger.error(f"Error fetching audit logs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch audit logs: {str(e)}")

