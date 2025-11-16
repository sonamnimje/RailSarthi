"""
Conflict Predictor - GNN-based model using PyTorch Geometric to predict conflict severity and risk scores.
"""
import numpy as np
from typing import Dict, Any, List, Tuple
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# Try to import PyTorch and PyTorch Geometric, but make optional
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("PyTorch not available. Conflict predictor will use fallback heuristics. Install with: pip install torch")

try:
    from torch_geometric.nn import GraphSAGE, GCNConv, global_mean_pool
    from torch_geometric.data import Data, Batch
    TORCH_GEOMETRIC_AVAILABLE = True
except ImportError:
    TORCH_GEOMETRIC_AVAILABLE = False
    logger.warning("torch_geometric not available. Conflict predictor will use fallback heuristics. Install with: pip install torch-geometric")


if TORCH_AVAILABLE and TORCH_GEOMETRIC_AVAILABLE:
    class ConflictGNN(nn.Module):
        """Graph Neural Network for conflict prediction using GraphSAGE"""
        
        def __init__(self, node_features_dim=8, edge_features_dim=6, hidden_dim=64, num_layers=2):
            super(ConflictGNN, self).__init__()
            self.num_layers = num_layers
            self.hidden_dim = hidden_dim
            
            # GraphSAGE layers
            self.convs = nn.ModuleList()
            self.convs.append(GraphSAGE(node_features_dim, hidden_dim, num_layers=1))
            for _ in range(num_layers - 1):
                self.convs.append(GraphSAGE(hidden_dim, hidden_dim, num_layers=1))
            
            # Edge feature processing
            self.edge_mlp = nn.Sequential(
                nn.Linear(edge_features_dim, hidden_dim),
                nn.ReLU(),
                nn.Linear(hidden_dim, hidden_dim)
            )
            
            # Output layer for edge risk scores
            self.risk_predictor = nn.Sequential(
                nn.Linear(hidden_dim * 2, hidden_dim),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(hidden_dim, 1),
                nn.Sigmoid()
            )
        
        def forward(self, data: Data) -> torch.Tensor:
            """Forward pass through GNN"""
            x, edge_index, edge_attr = data.x, data.edge_index, data.edge_attr
            
            # Process node features through GraphSAGE
            for i, conv in enumerate(self.convs):
                x = conv(x, edge_index)
                if i < len(self.convs) - 1:
                    x = F.relu(x)
                    x = F.dropout(x, training=self.training, p=0.2)
            
            # Process edge features
            if edge_attr is not None and edge_attr.size(0) > 0:
                edge_features = self.edge_mlp(edge_attr)
            else:
                edge_features = torch.zeros((edge_index.size(1), self.hidden_dim), device=x.device)
            
            # Compute edge risk scores by combining source and target node embeddings
            if edge_index.size(1) > 0:
                src_nodes = edge_index[0]
                dst_nodes = edge_index[1]
                src_emb = x[src_nodes]
                dst_emb = x[dst_nodes]
                
                # Combine node embeddings and edge features
                edge_combined = torch.cat([src_emb, dst_emb], dim=1)
                risk_scores = self.risk_predictor(edge_combined).squeeze(-1)
            else:
                risk_scores = torch.zeros(0, device=x.device)
            
            return risk_scores
else:
    # Dummy class when PyTorch/PyG not available
    class ConflictGNN:
        def __init__(self, *args, **kwargs):
            pass
        def forward(self, *args, **kwargs):
            return None


class ConflictPredictor:
    """
    Graph Neural Network-based conflict predictor.
    Uses message passing to aggregate information from network topology.
    """
    
    def __init__(self, model_path: str = None):
        if not TORCH_AVAILABLE or not TORCH_GEOMETRIC_AVAILABLE:
            self.model = None
            self.device = None
            self.model_path = None
            logger.info("ConflictPredictor using fallback heuristics (PyTorch/PyG not available)")
            return
        
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"ConflictPredictor using device: {self.device}")
        
        # Initialize model
        self.model = ConflictGNN(
            node_features_dim=8,
            edge_features_dim=6,
            hidden_dim=64,
            num_layers=2
        ).to(self.device)
        
        # Load model if path provided
        if model_path is None:
            model_path = Path(__file__).parent / "model.pth"
        
        self.model_path = Path(model_path)
        if self.model_path.exists():
            try:
                self.model.load_state_dict(torch.load(self.model_path, map_location=self.device))
                self.model.eval()
                logger.info(f"Loaded GNN model from {self.model_path}")
            except Exception as e:
                logger.warning(f"Failed to load model from {self.model_path}: {e}. Using random weights.")
        else:
            logger.info(f"Model file not found at {self.model_path}. Using random weights. Create and train model for better predictions.")
            # Save initial random model
            try:
                self.model_path.parent.mkdir(parents=True, exist_ok=True)
                torch.save(self.model.state_dict(), self.model_path)
            except Exception as e:
                logger.warning(f"Could not save initial model: {e}")
    
    def predict_conflict_scores(self, state_tensor: Dict[str, Any]) -> Dict[str, float]:
        """
        Predict conflict risk scores for edges/trains.
        
        Args:
            state_tensor: Encoded state from StateEncoder.encode_graph_state()
        
        Returns:
            Dictionary mapping conflict_id -> risk_score (0.0 to 1.0)
        """
        if self.model is None:
            # Fallback to heuristic when PyTorch/PyG not available
            return self._predict_heuristic(state_tensor)
        
        self.model.eval()
        
        node_features = state_tensor.get("node_features")
        edge_index = state_tensor.get("edge_index")
        edge_features = state_tensor.get("edge_features")
        conflicts = state_tensor.get("conflicts", [])
        
        if node_features is None or edge_index is None:
            return {}
        
        # Convert to torch tensors if they're numpy arrays
        if isinstance(node_features, np.ndarray):
            node_features = torch.from_numpy(node_features).float()
        if isinstance(edge_index, np.ndarray):
            edge_index = torch.from_numpy(edge_index).long()
        if edge_features is not None and isinstance(edge_features, np.ndarray):
            edge_features = torch.from_numpy(edge_features).float()
        
        # Move to device
        node_features = node_features.to(self.device)
        edge_index = edge_index.to(self.device)
        if edge_features is not None:
            edge_features = edge_features.to(self.device)
        
        # Create PyG Data object
        if not TORCH_GEOMETRIC_AVAILABLE:
            # Should not reach here if model is None, but handle gracefully
            return self._predict_heuristic(state_tensor)
        
        # Check edge_features size - handle both torch and numpy
        if edge_features is not None:
            if TORCH_AVAILABLE and isinstance(edge_features, torch.Tensor):
                has_edges = edge_features.size(0) > 0
            else:
                has_edges = len(edge_features.shape) > 0 and edge_features.shape[0] > 0
        else:
            has_edges = False
        
        data = Data(
            x=node_features,
            edge_index=edge_index,
            edge_attr=edge_features if has_edges else None
        )
        
        # Predict
        if TORCH_AVAILABLE:
            context_manager = torch.no_grad()
        else:
            from contextlib import nullcontext
            context_manager = nullcontext()
        
        with context_manager:
            try:
                risk_scores = self.model(data)
                if TORCH_AVAILABLE:
                    risk_scores_np = risk_scores.cpu().numpy()
                else:
                    risk_scores_np = np.array(risk_scores)
            except Exception as e:
                logger.error(f"Error in GNN forward pass: {e}", exc_info=True)
                # Get edge count - handle both torch and numpy
                if TORCH_AVAILABLE and isinstance(edge_index, torch.Tensor):
                    edge_count = edge_index.size(1) if edge_index.size(1) > 0 else 0
                else:
                    edge_count = edge_index.shape[1] if len(edge_index.shape) > 1 and edge_index.shape[1] > 0 else 0
                risk_scores_np = np.zeros(edge_count)
        
        # Map edge risk scores to conflicts
        conflict_risks = {}
        mapping = state_tensor.get("mapping", {})
        station_to_idx = mapping.get("station_to_node_idx", {})
        
        for conflict in conflicts:
            conflict_id = f"{conflict.get('type', 'unknown')}_{conflict.get('section', 'unknown')}"
            section_id = conflict.get("section", "")
            trains = conflict.get("trains", [])
            
            # Find edge index for this conflict's section
            edge_risk = 0.5  # Default risk
            
            # Try to find corresponding edge in graph
            if edge_index.size(1) > 0 and len(risk_scores_np) > 0:
                # Get section info from conflict
                # For now, use average risk or conflict severity
                severity = conflict.get("severity", "medium")
                severity_map = {"low": 0.2, "medium": 0.5, "high": 0.8, "critical": 1.0}
                base_risk = severity_map.get(severity, 0.5)
                
                # Factor in number of trains
                train_factor = min(len(trains) / 3.0, 1.0)
                
                # Factor in distance
                distance = conflict.get("distance_km", 10.0)
                distance_factor = max(0.0, 1.0 - distance / 5.0)
                
                # Combine with GNN prediction (use mean edge risk)
                gnn_risk = float(risk_scores_np.mean()) if len(risk_scores_np) > 0 else 0.5
                
                # Weighted combination
                edge_risk = base_risk * 0.4 + train_factor * 0.2 + distance_factor * 0.2 + gnn_risk * 0.2
                edge_risk = min(1.0, max(0.0, edge_risk))
            
            conflict_risks[conflict_id] = float(edge_risk)
        
        return conflict_risks
    
    def _predict_heuristic(self, state_tensor: Dict[str, Any]) -> Dict[str, float]:
        """Fallback heuristic when GNN is not available"""
        conflicts = state_tensor.get("conflicts", [])
        conflict_risks = {}
        
        for conflict in conflicts:
            conflict_id = f"{conflict.get('type', 'unknown')}_{conflict.get('section', 'unknown')}"
            severity = conflict.get("severity", "medium")
            severity_map = {"low": 0.2, "medium": 0.5, "high": 0.8, "critical": 1.0}
            base_risk = severity_map.get(severity, 0.5)
            
            trains = conflict.get("trains", [])
            train_factor = min(len(trains) / 3.0, 1.0)
            
            distance = conflict.get("distance_km", 10.0)
            distance_factor = max(0.0, 1.0 - distance / 5.0)
            
            risk_score = base_risk * 0.5 + train_factor * 0.3 + distance_factor * 0.2
            conflict_risks[conflict_id] = float(min(1.0, risk_score))
        
        return conflict_risks
    
    def predict_conflict_edges(self, state_tensor: Dict[str, Any], top_k: int = 10) -> List[Tuple[str, float]]:
        """
        Predict top-K conflict edges sorted by risk.
        
        Returns:
            List of (conflict_id, risk_score) tuples sorted by risk (highest first)
        """
        risks = self.predict_conflict_scores(state_tensor)
        sorted_risks = sorted(risks.items(), key=lambda x: x[1], reverse=True)
        return sorted_risks[:top_k]
    
    def predict_conflict_severity(self, state_encoding: Dict[str, Any], 
                                  conflicts: List[Dict]) -> Dict[str, float]:
        """Wrapper method for easier integration (backward compatibility)"""
        # Build state_tensor from state_encoding
        state_tensor = {
            "node_features": state_encoding.get("node_features", np.zeros((0, 8))),
            "edge_index": state_encoding.get("edge_index", np.zeros((2, 0), dtype=np.int64)),
            "edge_features": state_encoding.get("edge_features", np.zeros((0, 6))),
            "conflicts": conflicts,
            "mapping": state_encoding.get("mapping", {}),
        }
        
        return self.predict_conflict_scores(state_tensor)
