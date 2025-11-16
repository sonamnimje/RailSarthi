"""
Reinforcement Learning Agent for train traffic optimization.
Uses stable-baselines3 PPO for fast inference.
"""
import numpy as np
from typing import Dict, Any, List, Tuple, Optional
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Try to import PyTorch, but make it optional
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("PyTorch not available. RL agent will use fallback heuristics. Install with: pip install torch")

# Try to import stable-baselines3, but make it optional
try:
    from stable_baselines3 import PPO
    from stable_baselines3.common.vec_env import DummyVecEnv
    SB3_AVAILABLE = True
except ImportError:
    SB3_AVAILABLE = False
    logger.warning("stable-baselines3 not available. RL agent will use fallback heuristics. Install with: pip install stable-baselines3")


class RLAgent:
    """
    Reinforcement Learning agent for conflict resolution using PPO.
    Loads pre-trained policy for fast inference.
    """
    
    def __init__(self, policy_path: str = None):
        self.policy = None
        self.state_dim = 64  # Default state dimension
        self.device = None
        
        if not TORCH_AVAILABLE or not SB3_AVAILABLE:
            logger.info("RLAgent using fallback heuristics (PyTorch/stable-baselines3 not available)")
            return
        
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"RLAgent using device: {self.device}")
        
        if policy_path is None:
            policy_path = Path(__file__).parent / "rl_policy.zip"
        
        self.policy_path = Path(policy_path)
        
        if self.policy_path.exists():
            try:
                self.policy = PPO.load(str(self.policy_path), device=self.device)
                logger.info(f"Loaded RL policy from {self.policy_path}")
            except Exception as e:
                logger.warning(f"Failed to load RL policy from {self.policy_path}: {e}. Using fallback.")
                self.policy = None
        else:
            logger.info(f"RL policy file not found at {self.policy_path}. Using fallback heuristics. Train and save policy for better predictions.")
    
    def rl_action(self, state_tensor: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get RL action for current state.
        
        Args:
            state_tensor: Encoded state from StateEncoder.encode_graph_state()
        
        Returns:
            Action dict: {
                "hold": {train_id: bool},
                "allow": {train_id: bool},
                "regulate_speed": {train_id: float}  # speed multiplier 0.0-1.0
            }
        """
        if self.policy is None:
            return self._fallback_action(state_tensor)
        
        # Extract state vector
        obs = self._extract_observation(state_tensor)
        
        # Get action from policy (deterministic for inference)
        try:
            action, _ = self.policy.predict(obs, deterministic=True)
            return self._decode_action(action, state_tensor)
        except Exception as e:
            logger.error(f"Error in RL policy prediction: {e}", exc_info=True)
            return self._fallback_action(state_tensor)
    
    def _extract_observation(self, state_tensor: Dict[str, Any]) -> np.ndarray:
        """Extract observation vector from state tensor"""
        # Flatten state features
        node_features = state_tensor.get("node_features")
        train_features = state_tensor.get("train_features")
        
        if node_features is not None:
            if TORCH_AVAILABLE and isinstance(node_features, torch.Tensor):
                node_vec = node_features.flatten().cpu().numpy()
            else:
                node_vec = np.array(node_features).flatten()
        else:
            node_vec = np.zeros(0)
        
        if train_features is not None:
            if TORCH_AVAILABLE and isinstance(train_features, torch.Tensor):
                train_vec = train_features.flatten().cpu().numpy()
            else:
                train_vec = np.array(train_features).flatten()
        else:
            train_vec = np.zeros(0)
        
        # Combine and pad/truncate to state_dim
        obs = np.concatenate([node_vec, train_vec])
        
        if len(obs) < self.state_dim:
            obs = np.pad(obs, (0, self.state_dim - len(obs)))
        else:
            obs = obs[:self.state_dim]
        
        return obs.astype(np.float32)
    
    def _decode_action(self, action: np.ndarray, state_tensor: Dict[str, Any]) -> Dict[str, Any]:
        """Decode action array to structured action dict"""
        # Simple decoding: action[0] determines precedence, action[1] determines speed regulation
        # In production, this would be more sophisticated
        
        conflicts = state_tensor.get("conflicts", [])
        mapping = state_tensor.get("mapping", {})
        train_to_idx = mapping.get("train_to_train_idx", {})
        
        result = {
            "hold": {},
            "allow": {},
            "regulate_speed": {},
        }
        
        for conflict in conflicts:
            trains = conflict.get("trains", [])
            if len(trains) < 2:
                continue
            
            # Determine which train to hold/allow based on action
            action_idx = int(action[0] % len(trains)) if len(action) > 0 else 0
            precedence_train = trains[action_idx] if trains else None
            
            # Speed regulation (0.7 to 1.0)
            speed_mult = 0.7 + (action[1] % 0.3) if len(action) > 1 else 1.0
            
            for train_id in trains:
                if train_id == precedence_train:
                    result["allow"][train_id] = True
                    result["hold"][train_id] = False
                else:
                    result["hold"][train_id] = True
                    result["allow"][train_id] = False
                
                result["regulate_speed"][train_id] = float(speed_mult)
        
        return result
    
    def _fallback_action(self, state_tensor: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback heuristic when RL policy is not available"""
        conflicts = state_tensor.get("conflicts", [])
        
        result = {
            "hold": {},
            "allow": {},
            "regulate_speed": {},
        }
        
        # Simple heuristic: allow first train, hold others
        for conflict in conflicts:
            trains = conflict.get("trains", [])
            if len(trains) < 2:
                continue
            
            for i, train_id in enumerate(trains):
                if i == 0:
                    result["allow"][train_id] = True
                    result["hold"][train_id] = False
                else:
                    result["hold"][train_id] = True
                    result["allow"][train_id] = False
                
                result["regulate_speed"][train_id] = 1.0
        
        return result
    
    def get_action(self, state: Dict[str, Any], conflicts: List[Dict], 
                   trains: Dict[str, Any]) -> Dict[str, Any]:
        """
        Get action recommendation from RL agent (backward compatibility).
        
        Args:
            state: Encoded state (can be numpy or torch)
            conflicts: List of conflicts
            trains: Dictionary of train objects
        
        Returns:
            Dictionary with action recommendations per conflict
        """
        # Convert state to state_tensor format if needed
        if isinstance(state, dict) and "node_features" in state:
            state_tensor = state.copy()
            state_tensor["conflicts"] = conflicts
        else:
            # Legacy format - create minimal state_tensor
            num_trains = len(trains) if trains else 0
            if TORCH_AVAILABLE:
                default_node_features = torch.zeros((1, 8))
                default_train_features = torch.zeros((num_trains, 10))
            else:
                default_node_features = np.zeros((1, 8))
                default_train_features = np.zeros((num_trains, 10))
            
            state_tensor = {
                "node_features": state.get("node_features", default_node_features) if isinstance(state, dict) else default_node_features,
                "train_features": default_train_features,
                "conflicts": conflicts,
                "mapping": {"train_to_train_idx": {tid: i for i, tid in enumerate(trains.keys())}},
            }
        
        rl_actions = self.rl_action(state_tensor)
        
        # Convert to old format
        actions = {}
        for conflict in conflicts:
            conflict_id = f"{conflict.get('type', 'unknown')}_{conflict.get('section', 'unknown')}"
            trains_involved = conflict.get("trains", [])
            
            # Determine precedence from RL actions
            precedence = None
            wait_times = {}
            speed_regulation = 1.0
            
            for train_id in trains_involved:
                if rl_actions.get("allow", {}).get(train_id, False):
                    precedence = train_id
                    wait_times[train_id] = 0
                else:
                    wait_times[train_id] = 120  # Default wait
            
                speed_reg = rl_actions.get("regulate_speed", {}).get(train_id, 1.0)
                if speed_reg < speed_regulation:
                    speed_regulation = speed_reg
            
            if not precedence and trains_involved:
                precedence = trains_involved[0]
            
            actions[conflict_id] = {
                "precedence": precedence,
                "wait_times": wait_times,
                "speed_regulation": speed_regulation,
                "method": "RL Agent (PPO)" if self.policy else "RL Agent (Fallback)",
                "confidence": 0.7 if self.policy else 0.5,
            }
        
        return actions
