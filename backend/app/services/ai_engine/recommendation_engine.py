"""
Hybrid Recommendation Engine - Combines OR-Tools, RL, and GNN predictions
to produce optimal conflict resolution recommendations.
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from .state_encoder import StateEncoder
from .conflict_predictor import ConflictPredictor
from .optimizer_or import OptimizerOR
from .rl_agent import RLAgent
from .explainer import Explainer
from .feedback_loop import FeedbackLoop

logger = logging.getLogger(__name__)


class RecommendationEngine:
    """
    Main AI recommendation engine that combines multiple approaches.
    """
    
    def __init__(self):
        try:
            self.state_encoder = StateEncoder()
            self.conflict_predictor = ConflictPredictor()
            self.optimizer_or = OptimizerOR()
            self.rl_agent = RLAgent()
            self.explainer = Explainer()
            self.feedback_loop = FeedbackLoop()
        except Exception as e:
            logger.warning(f"Some AI engine components failed to initialize: {e}. Continuing with available components.")
            # Initialize with fallbacks
            self.state_encoder = StateEncoder() if 'state_encoder' not in locals() else self.state_encoder
            self.conflict_predictor = ConflictPredictor() if 'conflict_predictor' not in locals() else self.conflict_predictor
            self.optimizer_or = OptimizerOR() if 'optimizer_or' not in locals() else self.optimizer_or
            try:
                self.rl_agent = RLAgent() if 'rl_agent' not in locals() else self.rl_agent
            except:
                self.rl_agent = None
            try:
                self.explainer = Explainer() if 'explainer' not in locals() else self.explainer
            except:
                self.explainer = None
            try:
                self.feedback_loop = FeedbackLoop() if 'feedback_loop' not in locals() else self.feedback_loop
            except:
                self.feedback_loop = None
        
        # Weights for combining different approaches
        self.or_weight = 0.5
        self.rl_weight = 0.3
        self.gnn_weight = 0.2
        
        # Adaptive weights (can be updated based on performance)
        self.adaptive_weights = True
    
    def generate_recommendations(self, engine_state: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Generate AI recommendations for current engine state.
        
        Args:
            engine_state: State dict from DigitalTwinEngine.get_state()
        
        Returns:
            List of recommendation dictionaries with structure:
            {
                "conflict_id": str,
                "solution": {
                    "precedence": [...],
                    "holds": {train_id: seconds},
                    "crossing": station_id,
                    "speed_adjust": {train_id: kmph}
                },
                "confidence": float (0.0-1.0),
                "explanation": str,
                "timestamp": iso string
            }
        """
        conflicts = engine_state.get("conflicts", [])
        
        if not conflicts:
            return []
        
        # Extract components from engine_state
        graph_data = engine_state.get("graph", {})
        nodes_data = graph_data.get("nodes", [])
        edges_data = graph_data.get("edges", [])
        trains_data = engine_state.get("trains", [])
        
        # Convert to dict format
        stations = {node["id"]: node for node in nodes_data}
        sections = {edge.get("id", f"{edge['from']}-{edge['to']}"): edge for edge in edges_data}
        
        # Convert trains list to dict (need to get from engine if available)
        # For now, create minimal train objects from state data
        trains = {}
        for train_data in trains_data:
            class TrainObj:
                def __init__(self, data):
                    self.train_id = data.get("train_id", "")
                    self.priority = 3  # Default - would need to get from engine's train objects
                    self.train_type = data.get("train_type", "passenger")
                    self.delay_seconds = data.get("delay", 0)
                    self.current_section = data.get("current_section", "")
                    self.speed_kmph = data.get("speed", 0.0)
                    self.progress = data.get("progress", 0.0)
                    self.signal_aspect = data.get("signal_aspect", "RED")
                    self.status = data.get("status", "stopped")
                    self.next_station = data.get("next_station", "")
            
            train_obj = TrainObj(train_data)
            trains[train_obj.train_id] = train_obj
        
        current_time = datetime.fromisoformat(engine_state.get("timestamp", datetime.now().isoformat()))
        
        return self.get_recommendations(engine_state, trains, sections, stations, current_time)
    
    def get_recommendations(self, engine_state: Dict[str, Any],
                           trains: Dict[str, Any],
                           sections: Dict[str, Dict],
                           stations: Dict[str, Dict],
                           current_time: datetime) -> List[Dict[str, Any]]:
        """
        Generate AI recommendations for all conflicts.
        
        Args:
            engine_state: State from DigitalTwinEngine.get_state()
            trains: Dictionary of Train objects
            sections: Dictionary of section information
            stations: Dictionary of station information
            current_time: Current simulation time
        
        Returns:
            List of recommendation dictionaries
        """
        conflicts = engine_state.get("conflicts", [])
        
        if not conflicts:
            return []
        
        # Encode state to tensor format
        try:
            state_tensor = self.state_encoder.encode_graph_state(engine_state)
        except Exception as e:
            logger.warning(f"State encoding failed: {e}. Using fallback.")
            state_tensor = None
        
        # Get top-K conflicts from GNN
        conflict_ids_top = set()
        try:
            if state_tensor is not None:
                top_conflicts = self.conflict_predictor.predict_conflict_edges(state_tensor, top_k=10)
                conflict_ids_top = {cid for cid, _ in top_conflicts}
        except Exception as e:
            logger.warning(f"Conflict prediction failed: {e}. Using all conflicts.")
        
        # Filter conflicts to top-K
        if conflict_ids_top:
            filtered_conflicts = [c for c in conflicts 
                                 if f"{c.get('type', 'unknown')}_{c.get('section', 'unknown')}" in conflict_ids_top]
        else:
            filtered_conflicts = conflicts[:5]  # Fallback to first 5
        
        if not filtered_conflicts:
            filtered_conflicts = conflicts[:5]  # Fallback to first 5
        
        # Get predictions from each model
        try:
            state_encoding_np = self.state_encoder.encode_full_state(engine_state)  # For backward compat
        except:
            state_encoding_np = None
        
        try:
            if state_tensor is not None:
                gnn_risks = self.conflict_predictor.predict_conflict_scores(state_tensor)
            else:
                gnn_risks = {}
        except Exception as e:
            logger.warning(f"GNN risk prediction failed: {e}. Using default risks.")
            gnn_risks = {}
        
        # Build state dict for OR solver
        or_state = {
            "trains": trains,
            "sections": sections,
            "stations": stations,
        }
        
        # Get OR solutions for each conflict
        or_resolutions = {}
        for conflict in filtered_conflicts:
            conflict_id = f"{conflict.get('type', 'unknown')}_{conflict.get('section', 'unknown')}"
            try:
                or_solution = self.optimizer_or.solve_precedence_problem(or_state, conflict)
                or_resolutions[conflict_id] = or_solution
            except Exception as e:
                logger.warning(f"OR solver failed for conflict {conflict_id}: {e}. Using empty solution.")
                or_resolutions[conflict_id] = {}
        
        # Get RL actions
        try:
            if self.rl_agent and state_tensor is not None:
                rl_actions_dict = self.rl_agent.rl_action(state_tensor)
            else:
                rl_actions_dict = {}
            
            if self.rl_agent and state_encoding_np is not None:
                rl_actions = self.rl_agent.get_action(state_encoding_np, filtered_conflicts, trains)
            else:
                rl_actions = {}
        except Exception as e:
            logger.warning(f"RL agent failed: {e}. Using empty actions.")
            rl_actions_dict = {}
            rl_actions = {}
        
        # Combine recommendations
        recommendations = []
        
        for conflict in filtered_conflicts:
            conflict_id = f"{conflict.get('type', 'unknown')}_{conflict.get('section', 'unknown')}"
            
            # Get recommendations from each method
            or_solution = or_resolutions.get(conflict_id, {})
            rl_rec = rl_actions.get(conflict_id, {})
            gnn_risk = gnn_risks.get(conflict_id, 0.5)
            
            # Convert OR solution to combined format
            or_rec = {
                "precedence": or_solution.get("precedence", [])[0] if or_solution.get("precedence") else None,
                "wait_times": or_solution.get("hold_times", {}),
                "crossing_station": or_solution.get("crossing_station"),
                "hold_time_sec": max(or_solution.get("hold_times", {}).values()) if or_solution.get("hold_times") else 0,
                "method": "OR-Tools CP-SAT",
                "optimal": or_solution.get("solver_stats", {}).get("status") == "OPTIMAL",
            }
            
            # Combine using weighted voting
            combined_rec = self._combine_recommendations(
                or_rec, rl_rec, gnn_risk, conflict, trains
            )
            
            # Generate explanation with feature attributions
            explain_state = {
                "conflict": conflict,
                "trains": trains,
                "sections": sections,
                "stations": stations,
            }
            try:
                if self.explainer:
                    explanation_data = self.explainer.explain_decision(explain_state, combined_rec)
                else:
                    explanation_data = {"text": "AI recommendation based on current traffic conditions", "feature_importances": {}}
            except Exception as e:
                logger.warning(f"Explainer failed: {e}. Using default explanation.")
                explanation_data = {"text": "AI recommendation based on current traffic conditions", "feature_importances": {}}
            
            # Calculate confidence
            confidence = self._calculate_confidence(or_rec, rl_rec, gnn_risk)
            
            # Build speed adjustments from RL actions
            speed_adjust = {}
            try:
                for train_id in conflict.get("trains", []):
                    speed_mult = rl_actions_dict.get("regulate_speed", {}).get(train_id, 1.0) if rl_actions_dict else 1.0
                    train_obj = trains.get(train_id)
                    if train_obj:
                        if isinstance(train_obj, dict):
                            base_speed = train_obj.get('max_speed_kmph', train_obj.get('max_speed', 60.0))
                        else:
                            base_speed = getattr(train_obj, 'speed_kmph', getattr(train_obj, 'max_speed_kmph', 60.0))
                        speed_adjust[train_id] = float(base_speed * speed_mult)
            except Exception as e:
                logger.warning(f"Speed adjustment calculation failed: {e}")
                speed_adjust = {}
            
            recommendation = {
                "conflict_id": conflict_id,
                "conflict": conflict,  # Include conflict info for map highlighting
                "solution": {
                    "precedence": combined_rec.get("precedence") if isinstance(combined_rec.get("precedence"), list) else [combined_rec.get("precedence")] if combined_rec.get("precedence") else [],
                    "holds": combined_rec.get("wait_times", {}),
                    "crossing": combined_rec.get("crossing_station"),
                    "speed_adjust": speed_adjust,
                },
                "confidence": confidence,
                "explanation": explanation_data.get("text", ""),
                "feature_importances": explanation_data.get("feature_importances", {}),
                "timestamp": current_time.isoformat(),
                "expected_delta_kpis": {
                    "delay_reduction_minutes": max(combined_rec.get("wait_times", {}).values(), default=0) / 60.0,
                    "throughput_impact": 0.0,  # Would be computed from solution
                }
            }
            
            recommendations.append(recommendation)
        
        return recommendations
    
    def _combine_recommendations(self, or_rec: Dict, rl_rec: Dict, gnn_risk: float,
                                conflict: Dict, trains: Dict) -> Dict[str, Any]:
        """Combine recommendations from different methods"""
        # Start with OR-Tools solution (most reliable)
        combined = or_rec.copy() if or_rec else {}
        
        # If OR-Tools failed, use RL
        if not or_rec or not or_rec.get("precedence"):
            if rl_rec and rl_rec.get("precedence"):
                combined = rl_rec.copy()
        
        # Adjust based on GNN risk score
        if gnn_risk > 0.8:  # High risk
            # Increase wait times for safety
            wait_times = combined.get("wait_times", {})
            for train_id in wait_times:
                wait_times[train_id] = int(wait_times[train_id] * 1.2)  # 20% buffer
            combined["wait_times"] = wait_times
        
        # Merge speed regulation from RL if available
        if rl_rec and rl_rec.get("speed_regulation"):
            combined["speed_regulation"] = rl_rec["speed_regulation"]
        
        # Ensure precedence is set
        if not combined.get("precedence"):
            # Fallback: highest priority train
            trains_involved = conflict.get("trains", [])
            if trains_involved:
                train_priorities = [
                    (tid, getattr(trains.get(tid, None), 'priority', 3))
                    for tid in trains_involved if tid in trains
                ]
                if train_priorities:
                    combined["precedence"] = max(train_priorities, key=lambda x: x[1])[0]
                else:
                    combined["precedence"] = trains_involved[0]
        
        return combined
    
    def _calculate_confidence(self, or_rec: Dict, rl_rec: Dict, gnn_risk: float) -> float:
        """Calculate confidence score for recommendation"""
        confidence = 0.5  # Base confidence
        
        # OR-Tools optimal solution increases confidence
        if or_rec and or_rec.get("optimal"):
            confidence += 0.3
        
        # Agreement between methods increases confidence
        if or_rec and rl_rec:
            or_precedence = or_rec.get("precedence")
            rl_precedence = rl_rec.get("precedence")
            if or_precedence == rl_precedence:
                confidence += 0.2
        
        # High GNN risk decreases confidence (uncertainty)
        if gnn_risk > 0.8:
            confidence -= 0.1
        
        return max(0.0, min(1.0, confidence))
    
    def log_override(self, conflict_id: str, recommendation: Dict[str, Any],
                    override_decision: Dict[str, Any], state_encoding: Dict,
                    reason: Optional[str] = None):
        """Log human override for learning"""
        self.feedback_loop.log_override(
            conflict_id, recommendation, override_decision, state_encoding, reason
        )
        
        # Update adaptive weights if enabled
        if self.adaptive_weights:
            # Slightly reduce weight of method that was overridden
            # (simplified - in production, use more sophisticated update)
            pass

