"""
State Encoder - Converts railway network graph and train states into tensor representations
for GNN and RL models using PyTorch and PyTorch Geometric.
"""
import numpy as np
import networkx as nx
from typing import Dict, Any, List, Tuple, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Try to import PyTorch and PyTorch Geometric, but make optional
try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    logger.warning("PyTorch not available. State encoder will use numpy arrays. Install with: pip install torch")

try:
    from torch_geometric.data import Data
    TORCH_GEOMETRIC_AVAILABLE = True
except ImportError:
    TORCH_GEOMETRIC_AVAILABLE = False
    logger.warning("torch_geometric not available. State encoder will use numpy arrays. Install with: pip install torch-geometric")


class StateEncoder:
    """Encodes railway network state into tensor representations"""
    
    def __init__(self):
        self.node_features_dim = 8  # Station features
        self.edge_features_dim = 6  # Section features
        self.train_features_dim = 10  # Train features
    
    def encode_graph(self, stations: Dict[str, Dict], sections: Dict[str, Dict]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Encode railway network graph into node and edge feature matrices.
        
        Returns:
            node_features: (N, node_features_dim) array
            edge_index: (2, E) array of edge connections
            edge_features: (E, edge_features_dim) array
        """
        # Build NetworkX graph
        G = nx.DiGraph()
        station_ids = list(stations.keys())
        station_to_idx = {sid: idx for idx, sid in enumerate(station_ids)}
        
        # Add nodes
        for sid in station_ids:
            G.add_node(sid)
        
        # Add edges and collect features
        edge_list = []
        edge_features_list = []
        
        for section_id, section in sections.items():
            from_station = section.get("from_station", "")
            to_station = section.get("to_station", "")
            
            if from_station in station_to_idx and to_station in station_to_idx:
                G.add_edge(from_station, to_station, section_id=section_id, **section)
                edge_list.append((station_to_idx[from_station], station_to_idx[to_station]))
                
                # Edge features: [distance_km, tracks, electrified, max_speed, line_type_encoded, is_single_line]
                edge_feat = [
                    float(section.get("distance_km", 0.0)),
                    float(section.get("tracks", 1)),
                    1.0 if section.get("electrified", False) else 0.0,
                    float(section.get("max_speed_kmph", 100.0)) / 200.0,  # Normalize
                    1.0 if section.get("line_type", "main") == "main" else 0.0,
                    1.0 if section.get("tracks", 1) == 1 else 0.0,
                ]
                edge_features_list.append(edge_feat)
        
        # Node features: [lat, lon, is_junction, platforms, division_encoded, ...]
        node_features_list = []
        for sid in station_ids:
            station = stations[sid]
            node_feat = [
                float(station.get("lat", 0.0)) / 90.0,  # Normalize
                float(station.get("lon", 0.0)) / 180.0,  # Normalize
                1.0 if station.get("is_junction", False) else 0.0,
                float(station.get("platforms", 1)) / 10.0,  # Normalize
                1.0 if station.get("division", "").lower() == "mumbai" else 0.0,
                1.0 if station.get("division", "").lower() == "pune" else 0.0,
                1.0 if station.get("division", "").lower() == "solapur" else 0.0,
                0.0,  # Reserved for future features
            ]
            node_features_list.append(node_feat)
        
        # Convert to numpy arrays
        node_features = np.array(node_features_list, dtype=np.float32)
        edge_index = np.array(edge_list, dtype=np.int64).T if edge_list else np.zeros((2, 0), dtype=np.int64)
        edge_features = np.array(edge_features_list, dtype=np.float32) if edge_features_list else np.zeros((0, self.edge_features_dim), dtype=np.float32)
        
        return node_features, edge_index, edge_features
    
    def encode_trains(self, trains: Dict[str, Any], stations: Dict[str, Dict], sections: Dict[str, Dict]) -> np.ndarray:
        """
        Encode train states into feature matrix.
        
        Returns:
            train_features: (T, train_features_dim) array
        """
        train_features_list = []
        
        for train_id, train in trains.items():
            # Train features: [speed, progress, delay, priority, type_encoded, signal_aspect_encoded, ...]
            speed = train.speed_kmph / 200.0  # Normalize
            progress = train.progress
            delay = min(train.delay_seconds / 3600.0, 1.0)  # Normalize to hours, cap at 1
            priority = train.priority / 5.0  # Normalize priority (1-5)
            
            # Train type encoding (one-hot like)
            type_encoded = [
                1.0 if train.train_type.lower() == "express" else 0.0,
                1.0 if train.train_type.lower() == "passenger" else 0.0,
                1.0 if train.train_type.lower() == "freight" else 0.0,
            ]
            
            # Signal aspect encoding
            signal_map = {"RED": 0.0, "YELLOW": 0.5, "GREEN": 1.0, "DOUBLE_YELLOW": 0.75}
            signal_encoded = signal_map.get(train.signal_aspect, 0.0)
            
            # Status encoding
            status_map = {"stopped": 0.0, "accelerating": 0.33, "cruising": 0.66, "braking": 0.5, "arrived": 1.0}
            status_encoded = status_map.get(train.status, 0.0)
            
            # Current section info
            section = sections.get(train.current_section, {}) if train.current_section else {}
            section_tracks = float(section.get("tracks", 1)) / 2.0  # Normalize
            
            train_feat = [
                speed,
                progress,
                delay,
                priority,
                *type_encoded,
                signal_encoded,
                status_encoded,
                section_tracks,
            ]
            
            # Pad or truncate to train_features_dim
            if len(train_feat) < self.train_features_dim:
                train_feat.extend([0.0] * (self.train_features_dim - len(train_feat)))
            else:
                train_feat = train_feat[:self.train_features_dim]
            
            train_features_list.append(train_feat)
        
        if not train_features_list:
            return np.zeros((0, self.train_features_dim), dtype=np.float32)
        
        return np.array(train_features_list, dtype=np.float32)
    
    def encode_graph_state(self, engine_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Encode current DigitalTwinEngine state into tensors for GNN/OR/RL.
        
        Args:
            engine_state: State dict from DigitalTwinEngine.get_state()
        
        Returns:
            Dictionary with:
            - node_features: torch.Tensor [N, F]
            - edge_index: torch.LongTensor [2, E]
            - edge_features: torch.Tensor [E, Fe]
            - train_features: torch.Tensor [T, Ft]
            - mapping: {node_idx->station_code, train_idx->train_id}
        """
        # Extract components
        graph_data = engine_state.get("graph", {})
        nodes_data = graph_data.get("nodes", [])
        edges_data = graph_data.get("edges", [])
        trains_data = engine_state.get("trains", [])
        conflicts_data = engine_state.get("conflicts", [])
        
        # Convert to dict format
        stations_dict = {node["id"]: node for node in nodes_data}
        sections_dict = {edge.get("id", f"{edge['from']}-{edge['to']}"): edge for edge in edges_data}
        
        # Encode graph
        node_features_np, edge_index_np, edge_features_np = self.encode_graph(stations_dict, sections_dict)
        
        # Encode trains (convert list to dict format for encoder)
        trains_dict = {}
        for train_data in trains_data:
            # Create a simple train-like object
            class TrainObj:
                def __init__(self, data):
                    self.train_id = data.get("train_id", "")
                    self.speed_kmph = data.get("speed", 0.0)
                    self.progress = data.get("progress", 0.0)
                    self.delay_seconds = data.get("delay", 0)
                    self.priority = 3  # Default
                    self.train_type = data.get("train_type", "passenger")
                    self.signal_aspect = data.get("signal_aspect", "RED")
                    self.status = data.get("status", "stopped")
                    self.current_section = data.get("current_section", "")
            
            train_obj = TrainObj(train_data)
            trains_dict[train_obj.train_id] = train_obj
        
        train_features_np = self.encode_trains(trains_dict, stations_dict, sections_dict)
        
        # Convert to PyTorch tensors if available, otherwise return numpy arrays
        if TORCH_AVAILABLE:
            node_features = torch.from_numpy(node_features_np).float()
            edge_index = torch.from_numpy(edge_index_np).long() if edge_index_np.size > 0 else torch.zeros((2, 0), dtype=torch.long)
            edge_features = torch.from_numpy(edge_features_np).float() if edge_features_np.size > 0 else torch.zeros((0, self.edge_features_dim), dtype=torch.float)
            train_features = torch.from_numpy(train_features_np).float() if train_features_np.size > 0 else torch.zeros((0, self.train_features_dim), dtype=torch.float)
        else:
            # Fallback to numpy arrays
            node_features = node_features_np
            edge_index = edge_index_np if edge_index_np.size > 0 else np.zeros((2, 0), dtype=np.int64)
            edge_features = edge_features_np if edge_features_np.size > 0 else np.zeros((0, self.edge_features_dim), dtype=np.float32)
            train_features = train_features_np if train_features_np.size > 0 else np.zeros((0, self.train_features_dim), dtype=np.float32)
        
        # Create mappings
        station_ids = list(stations_dict.keys())
        train_ids = list(trains_dict.keys())
        node_mapping = {idx: sid for idx, sid in enumerate(station_ids)}
        train_mapping = {idx: tid for idx, tid in enumerate(train_ids)}
        
        return {
            "node_features": node_features,
            "edge_index": edge_index,
            "edge_features": edge_features,
            "train_features": train_features,
            "mapping": {
                "node_idx_to_station": node_mapping,
                "train_idx_to_train": train_mapping,
                "station_to_node_idx": {sid: idx for idx, sid in enumerate(station_ids)},
                "train_to_train_idx": {tid: idx for idx, tid in enumerate(train_ids)},
            },
            "conflicts": conflicts_data,
        }
    
    def encode_full_state(self, engine_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Encode complete simulation state for AI models (backward compatibility).
        
        Args:
            engine_state: State dict from DigitalTwinEngine.get_state()
        
        Returns:
            Dictionary with encoded features (numpy arrays for compatibility)
        """
        encoded = self.encode_graph_state(engine_state)
        
        # Convert back to numpy for backward compatibility
        node_feat = encoded["node_features"]
        edge_idx = encoded["edge_index"]
        edge_feat = encoded["edge_features"]
        train_feat = encoded["train_features"]
        
        # Convert torch tensors to numpy if needed
        if TORCH_AVAILABLE and isinstance(node_feat, torch.Tensor):
            node_feat = node_feat.numpy()
        if TORCH_AVAILABLE and isinstance(edge_idx, torch.Tensor):
            edge_idx = edge_idx.numpy()
        if TORCH_AVAILABLE and isinstance(edge_feat, torch.Tensor):
            edge_feat = edge_feat.numpy()
        if TORCH_AVAILABLE and isinstance(train_feat, torch.Tensor):
            train_feat = train_feat.numpy()
        
        return {
            "node_features": node_feat,
            "edge_index": edge_idx,
            "edge_features": edge_feat,
            "train_features": train_feat,
            "conflict_features": self.encode_conflicts(engine_state.get("conflicts", []), {}),
            "num_nodes": node_feat.shape[0] if len(node_feat.shape) > 0 else 0,
            "num_edges": edge_idx.shape[1] if len(edge_idx.shape) > 1 and edge_idx.shape[1] > 0 else 0,
            "num_trains": train_feat.shape[0] if len(train_feat.shape) > 0 else 0,
            "num_conflicts": len(engine_state.get("conflicts", [])),
            "mapping": encoded["mapping"],
        }
    
    def encode_conflicts(self, conflicts: List[Dict], sections: Dict[str, Dict]) -> np.ndarray:
        """Encode conflict information"""
        if not conflicts:
            return np.zeros((0, 5), dtype=np.float32)
        
        conflict_features_list = []
        for conflict in conflicts:
            # Conflict features: [type_encoded, severity_encoded, num_trains, distance, section_tracks]
            conflict_type = conflict.get("type", "unknown")
            type_encoded = 1.0 if conflict_type == "head-on" else (0.5 if conflict_type == "rear-end" else 0.0)
            
            severity = conflict.get("severity", "medium")
            severity_map = {"low": 0.33, "medium": 0.66, "high": 0.83, "critical": 1.0}
            severity_encoded = severity_map.get(severity, 0.5)
            
            trains_involved = len(conflict.get("trains", []))
            distance = conflict.get("distance_km", 0.0) / 10.0  # Normalize
            
            section_id = conflict.get("section", "")
            section = sections.get(section_id, {})
            section_tracks = float(section.get("tracks", 1)) / 2.0
            
            conflict_feat = [type_encoded, severity_encoded, trains_involved / 5.0, distance, section_tracks]
            conflict_features_list.append(conflict_feat)
        
        return np.array(conflict_features_list, dtype=np.float32)

