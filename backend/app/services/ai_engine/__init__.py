"""
Recommendation Engine wrapper that composes GNN, OR-Tools optimizer and RL agent.

This module provides `RecommendationEngine` which requires pretrained model artifacts
to be present in `app/models/ai/` (e.g. `gnn.pt`, `rl_agent.pt`).

Per project rules: if any required AI model files are missing, the engine will raise
RuntimeError rather than falling back to heuristics.
"""
from pathlib import Path
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class RecommendationEngine:
    """Compose GNN + OR-Tools + RL. Strict: require models present."""

    MODELS_DIR = Path(__file__).resolve().parents[2] / "models" / "ai"
    GNN_MODEL = MODELS_DIR / "gnn.pt"
    RL_MODEL = MODELS_DIR / "rl_agent.pt"

    def __init__(self):
        # Require model artifacts
        miss = []
        if not self.GNN_MODEL.exists():
            miss.append(str(self.GNN_MODEL))
        if not self.RL_MODEL.exists():
            miss.append(str(self.RL_MODEL))

        if miss:
            raise RuntimeError(
                "AI models missing. Provide GNN and RL agent artifacts at: " + ",".join(miss)
            )

        # Lazy model loading (actual torch/rl code omitted here). Models must be loaded
        # by the deployment engineer. This class only defines the interface the engine
        # will call from the Digital Twin.
        logger.info("RecommendationEngine: model artifacts found (loading deferred)")

    def get_recommendations(self, engine_state: Dict[str, Any], trains: Dict[str, Any], sections: Dict[str, Any], stations: Dict[str, Any], current_time) -> List[Dict[str, Any]]:
        """Return list of recommendations.

        This method expects model artifacts to be present. It will not run heuristic
        fallbacks. Implementations should combine:
         - GNN scoring (conflict severity per section)
         - OR-Tools constraint optimization (scheduling actions)
         - RL agent for fine-grained action selection

        Here we only expose the interface; actual model inference must be added by
        the operator using proper frameworks (PyTorch, OR-Tools).
        """
        # This placeholder will never be called unless models are loaded and replaced
        # with actual inference code. Raise to avoid accidental heuristic fallbacks.
        raise RuntimeError("RecommendationEngine.get_recommendations called but models not loaded")

    def record_override(self, override_record: Dict[str, Any]):
        """Ingest human override feedback to influence RL reward and OR weights.

        Real implementation should store feedback in DB and update online training
        or weight files. Here we provide the interface only.
        """
        logger.info("Received override feedback (recorded): %s", override_record)
        # No-op; real implementation required by deployment
"""
AI Engine for RailAnukriti - Smart Train Traffic Optimizer
Provides conflict detection, resolution recommendations, and learning capabilities.
"""
from .recommendation_engine import RecommendationEngine
from .state_encoder import StateEncoder
from .conflict_predictor import ConflictPredictor
from .optimizer_or import OptimizerOR
from .rl_agent import RLAgent
from .explainer import Explainer
from .feedback_loop import FeedbackLoop

__all__ = [
    'RecommendationEngine',
    'StateEncoder',
    'ConflictPredictor',
    'OptimizerOR',
    'RLAgent',
    'Explainer',
    'FeedbackLoop',
]

