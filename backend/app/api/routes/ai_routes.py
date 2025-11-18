"""
AI Recommendation API Routes
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Path
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import logging
from datetime import datetime
import uuid

from app.services.ai_engine.recommendation_engine import RecommendationEngine
from app.services.division_loader import load_division_dataset, normalize_stations, normalize_sections
from app.db.session import get_db_session
from app.db import models

router = APIRouter(prefix="/api/ai", tags=["ai"])

logger = logging.getLogger(__name__)

# Global AI engine instance (can be per-division in production)
_ai_engine: Optional[RecommendationEngine] = None


def get_ai_engine() -> RecommendationEngine:
    """Get or create AI engine instance"""
    global _ai_engine
    if _ai_engine is None:
        _ai_engine = RecommendationEngine()
    return _ai_engine


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


@router.get("/recommendation")
async def get_recommendations(
    division: str = Query(..., description="Division name"),
) -> List[Dict[str, Any]]:
    """
    Get AI recommendations for a division.
    
    Returns recommendations for train precedence, crossing avoidance, 
    overtake recommendations, platform assignments, and delay recovery.
    """
    try:
        division_lower = division.lower().strip()
        
        # Load division dataset
        dataset = load_division_dataset(division_lower)
        trains_df = dataset.get("trains")
        sections_df = dataset.get("sections")
        stations_df = dataset.get("stations")
        
        if trains_df is None or trains_df.empty:
            return []
        
        # Normalize data
        trains_list = trains_df.to_dict('records') if not trains_df.empty else []
        sections_list = sections_df.to_dict('records') if sections_df is not None and not sections_df.empty else []
        stations_list = normalize_stations(stations_df) if stations_df is not None and not stations_df.empty else []
        
        # Build data structures for AI engine
        trains_dict = {}
        for train in trains_list:
            train_id = str(train.get("train_id", ""))
            if train_id:
                trains_dict[train_id] = train
        
        sections_dict = {}
        for section in sections_list:
            section_id = str(section.get("section_id", ""))
            if section_id:
                sections_dict[section_id] = section
        
        stations_dict = {}
        for station in stations_list:
            station_code = str(station.get("code", ""))
            if station_code:
                stations_dict[station_code] = station
        
        # Get AI engine and generate recommendations
        try:
            ai_engine = get_ai_engine()
        except Exception as e:
            logger.warning(f"AI engine initialization failed: {e}. Returning empty recommendations.")
            return []
        
        # Build engine state from current train positions
        # Try to detect conflicts from train positions
        conflicts = []
        # Simple conflict detection: trains on same section
        section_trains = {}
        for train_id, train in trains_dict.items():
            route = str(train.get("route", "")).split(',')
            if len(route) >= 2:
                # Check for potential conflicts on sections
                for i in range(len(route) - 1):
                    section_key = f"{route[i].strip()}-{route[i+1].strip()}"
                    if section_key not in section_trains:
                        section_trains[section_key] = []
                    section_trains[section_key].append(train_id)
        
        # Find sections with multiple trains (potential conflicts)
        for section_key, train_list in section_trains.items():
            if len(train_list) > 1:
                conflicts.append({
                    "type": "overtake",
                    "section": section_key,
                    "trains": train_list,
                    "severity": "medium"
                })
        
        engine_state = {
            "trains": trains_dict,
            "sections": sections_dict,
            "stations": stations_dict,
            "conflicts": conflicts,
            "current_time": datetime.now(),
            "timestamp": datetime.now().isoformat()
        }
        
        # Generate recommendations
        try:
            recommendations = ai_engine.get_recommendations(
                engine_state=engine_state,
                trains=trains_dict,
                sections=sections_dict,
                stations=stations_dict,
                current_time=datetime.now()
            )
        except Exception as e:
            logger.warning(f"AI recommendation generation failed: {e}. Returning empty list.")
            return []
        
        # Format recommendations for frontend
        formatted_recs = []
        for rec in recommendations:
            conflict_id = f"conflict_{uuid.uuid4().hex[:8]}"
            formatted_recs.append({
                "conflict_id": conflict_id,
                "conflict": {
                    "type": rec.get("type", "precedence"),
                    "section": rec.get("section", ""),
                    "trains": rec.get("trains", []),
                    "severity": rec.get("severity", "medium")
                },
                "solution": {
                    "precedence": rec.get("precedence", []),
                    "holds": rec.get("wait_times", {}),
                    "crossing": rec.get("crossing_station"),
                    "speed_adjust": rec.get("speed_regulation", {})
                },
                "confidence": rec.get("confidence", 0.7),
                "explanation": rec.get("explanation", "AI recommendation based on current traffic conditions"),
                "timestamp": datetime.now().isoformat(),
                "expected_delta_kpis": {
                    "delay_reduction_minutes": rec.get("delay_reduction", 0),
                    "throughput_impact": rec.get("throughput_impact", 0)
                }
            })
        
        return formatted_recs
        
    except Exception as e:
        logger.error(f"Error generating recommendations for {division}: {e}", exc_info=True)
        # Return empty list on error rather than failing
        return []


@router.post("/accept")
async def accept_recommendation(
    request: AcceptRequest,
) -> Dict[str, Any]:
    """
    Accept an AI recommendation.
    """
    try:
        # Log acceptance
        with get_db_session() as db:
            override = models.AIOverride(
                override_id=str(uuid.uuid4()),
                division=request.division.lower(),
                conflict_id=request.recommendation_id,
                ai_solution_json={"accepted": True},
                human_solution_json={"action": "accept"},
                user_id=request.user_id or "system"
            )
            db.add(override)
            db.commit()
        
        # Notify AI engine
        try:
            ai_engine = get_ai_engine()
            ai_engine.record_override({
                "override_id": override.override_id,
                "conflict_id": request.recommendation_id,
                "action": "accept",
                "user_id": request.user_id
            })
        except Exception as e:
            logger.warning(f"AI engine not available to record acceptance: {e}")
        
        return {
            "status": "accepted",
            "message": "Recommendation accepted and applied",
            "recommendation_id": request.recommendation_id
        }
    except Exception as e:
        logger.error(f"Error accepting recommendation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to accept recommendation: {str(e)}")


@router.post("/override")
async def log_override(
    request: OverrideRequest,
) -> Dict[str, Any]:
    """
    Log a human override of an AI recommendation.
    """
    try:
        override_id = str(uuid.uuid4())
        
        with get_db_session() as db:
            override = models.AIOverride(
                override_id=override_id,
                division=request.division.lower(),
                conflict_id=request.recommendation_id,
                ai_solution_json={"recommendation_id": request.recommendation_id},
                human_solution_json=request.human_solution,
                user_id=request.user_id or "system",
                reason=request.reason
            )
            db.add(override)
            db.commit()
        
        # Notify AI engine
        try:
            ai_engine = get_ai_engine()
            ai_engine.record_override({
                "override_id": override_id,
                "conflict_id": request.recommendation_id,
                "action": "override",
                "human_solution": request.human_solution,
                "reason": request.reason,
                "user_id": request.user_id
            })
        except Exception as e:
            logger.warning(f"AI engine not available to record override: {e}")
        
        return {
            "status": "ok",
            "override_id": override_id,
            "message": "Override logged successfully"
        }
    except Exception as e:
        logger.error(f"Error logging override: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to log override: {str(e)}")


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
