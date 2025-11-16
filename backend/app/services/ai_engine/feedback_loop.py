"""
Feedback Loop - Learns from human overrides and controller decisions.
Stores overrides in database for training and analysis.
"""
import json
import logging
import uuid
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
import numpy as np

logger = logging.getLogger(__name__)

# Try to import database models
try:
    from app.db.models import AIOverride
    from app.db.session import SessionLocal
    DB_AVAILABLE = True
except ImportError:
    DB_AVAILABLE = False
    logger.warning("Database models not available. Feedback loop will use file-based storage.")


class FeedbackLoop:
    """
    Feedback learning system that captures human overrides and updates models.
    """
    
    def __init__(self, feedback_dir: Optional[Path] = None):
        if feedback_dir is None:
            feedback_dir = Path(__file__).parent.parent.parent / "data" / "ai_feedback"
        self.feedback_dir = feedback_dir
        self.feedback_dir.mkdir(parents=True, exist_ok=True)
        
        self.override_log_file = self.feedback_dir / "overrides.jsonl"
        self.training_data_file = self.feedback_dir / "training_data.jsonl"
    
    def record_override(self, override_obj: Dict[str, Any]) -> str:
        """
        Record an override to the database.
        
        Args:
            override_obj: {
                "division": str,
                "conflict_id": str,
                "ai_solution_json": dict,
                "human_solution_json": dict,
                "user_id": str (optional),
                "reason": str (optional)
            }
        
        Returns:
            override_id: Unique identifier for the override
        """
        override_id = str(uuid.uuid4())
        
        if DB_AVAILABLE:
            try:
                db = SessionLocal()
                override_record = AIOverride(
                    override_id=override_id,
                    division=override_obj.get("division", "unknown"),
                    conflict_id=override_obj.get("conflict_id", ""),
                    ai_solution_json=override_obj.get("ai_solution_json", {}),
                    human_solution_json=override_obj.get("human_solution_json", {}),
                    user_id=override_obj.get("user_id"),
                    reason=override_obj.get("reason")
                )
                db.add(override_record)
                db.commit()
                db.refresh(override_record)
                db.close()
                logger.info(f"Recorded override {override_id} for conflict {override_obj.get('conflict_id')} in database")
            except Exception as e:
                logger.error(f"Failed to record override in database: {e}", exc_info=True)
                # Fallback to file
                self._log_override_to_file(override_id, override_obj)
        else:
            self._log_override_to_file(override_id, override_obj)
        
        return override_id
    
    def _log_override_to_file(self, override_id: str, override_obj: Dict[str, Any]):
        """Fallback: log override to file"""
        override_record = {
            "override_id": override_id,
            "timestamp": datetime.utcnow().isoformat(),
            **override_obj
        }
        with open(self.override_log_file, 'a') as f:
            f.write(json.dumps(override_record) + '\n')
        logger.info(f"Logged override {override_id} to file")
    
    def log_override(self, conflict_id: str, ai_recommendation: Dict[str, Any],
                    human_decision: Dict[str, Any], state_encoding: Dict[str, np.ndarray],
                    reason: Optional[str] = None, division: str = "unknown", user_id: Optional[str] = None):
        """
        Log a human override of AI recommendation (backward compatibility).
        
        Args:
            conflict_id: Identifier for the conflict
            ai_recommendation: Original AI recommendation
            human_decision: Human override decision
            state_encoding: State encoding at time of decision
            reason: Optional reason for override
            division: Division name
            user_id: User ID
        """
        override_obj = {
            "division": division,
            "conflict_id": conflict_id,
            "ai_solution_json": self._serialize_dict(ai_recommendation),
            "human_solution_json": self._serialize_dict(human_decision),
            "user_id": user_id,
            "reason": reason,
        }
        self.record_override(override_obj)
    
    def compute_reward(self, ai_recommendation: Dict[str, Any],
                      human_decision: Dict[str, Any],
                      outcome: Optional[Dict[str, Any]] = None) -> float:
        """
        Compute reward signal for RL agent based on override.
        
        Args:
            ai_recommendation: AI's recommendation
            human_decision: Human's override
            outcome: Optional outcome metrics (delays, conflicts resolved, etc.)
        
        Returns:
            Reward value (negative if AI was wrong, positive if AI was right)
        """
        # If human overrode, AI gets negative reward
        # If outcome shows human decision was better, stronger negative reward
        
        base_reward = -0.5  # Base penalty for override
        
        if outcome:
            # Factor in actual outcomes
            ai_delay = outcome.get("ai_estimated_delay", 0)
            actual_delay = outcome.get("actual_delay", 0)
            
            # If actual delay is less than AI estimated, human was right
            if actual_delay < ai_delay:
                base_reward -= 0.5
            else:
                base_reward += 0.2  # AI might have been closer
        
        return base_reward
    
    def update_or_weights(self, conflict_type: str, override_count: int, total_count: int):
        """
        Update OR-Tools constraint weights based on override frequency.
        
        Args:
            conflict_type: Type of conflict (head-on, rear-end, etc.)
            override_count: Number of times this type was overridden
            total_count: Total number of this conflict type
        """
        override_rate = override_count / max(total_count, 1)
        
        # If override rate is high, adjust weights
        if override_rate > 0.3:
            logger.info(f"High override rate ({override_rate:.2%}) for {conflict_type}, consider adjusting OR weights")
        
        # In production, update actual constraint weights
        # For now, just log
    
    def get_training_batch(self, batch_size: int = 32) -> List[Dict[str, Any]]:
        """Get batch of training examples from feedback data"""
        training_examples = []
        
        if not self.override_log_file.exists():
            return training_examples
        
        # Read recent overrides
        with open(self.override_log_file, 'r') as f:
            lines = f.readlines()
        
        # Get last batch_size examples
        for line in lines[-batch_size:]:
            try:
                example = json.loads(line)
                training_examples.append(example)
            except json.JSONDecodeError:
                continue
        
        return training_examples
    
    def _serialize_dict(self, d: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize dictionary, handling numpy arrays and special types"""
        serialized = {}
        for k, v in d.items():
            if isinstance(v, np.ndarray):
                serialized[k] = v.tolist()
            elif isinstance(v, (np.integer, np.floating)):
                serialized[k] = float(v)
            elif isinstance(v, dict):
                serialized[k] = self._serialize_dict(v)
            elif isinstance(v, list):
                serialized[k] = [self._serialize_dict(item) if isinstance(item, dict) else item for item in v]
            else:
                serialized[k] = v
        return serialized
    
    def _serialize_state(self, state: Dict[str, np.ndarray]) -> Dict[str, Any]:
        """Serialize state encoding"""
        serialized = {}
        for k, v in state.items():
            if isinstance(v, np.ndarray):
                # Store shape and flattened data
                serialized[k] = {
                    "shape": list(v.shape),
                    "data": v.flatten().tolist(),
                }
            else:
                serialized[k] = v
        return serialized

