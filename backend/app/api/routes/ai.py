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
