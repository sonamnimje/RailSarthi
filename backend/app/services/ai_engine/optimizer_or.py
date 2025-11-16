"""
OR-Tools Constraint Programming Optimizer for conflict resolution.
Uses CP-SAT solver to find optimal train precedence and scheduling decisions.
"""
from typing import Dict, Any, List, Tuple, Optional
import logging
from datetime import datetime, timedelta

# Try to import ortools, but make it optional
logger = logging.getLogger(__name__)

try:
    from ortools.sat.python import cp_model
    ORTOOLS_AVAILABLE = True
except ImportError:
    ORTOOLS_AVAILABLE = False
    logger.warning("ortools not available. OR-Tools optimizer will use fallback heuristics. Install with: pip install ortools")


class OptimizerOR:
    """
    Constraint Programming optimizer using OR-Tools CP-SAT.
    Solves train precedence and scheduling problems with hard safety constraints.
    """
    
    def __init__(self):
        self.min_headway_seconds = 120  # Minimum 2 minutes between trains
        self.platform_clearance_seconds = 300  # 5 minutes to clear platform
    
    def solve_precedence_problem(self, state: Dict[str, Any], candidate_conflict: Dict[str, Any],
                                 delay_penalty: float = 1.0, throughput_weight: float = 0.5) -> Dict[str, Any]:
        """
        Solve precedence problem for a candidate conflict using CP-SAT.
        
        Args:
            state: Encoded state with trains, sections, stations
            candidate_conflict: Conflict dictionary with trains, section, type
            delay_penalty: Weight for delay minimization
            throughput_weight: Weight for throughput maximization
        
        Returns:
            Structured solution: {
                "precedence": [train_id, ...],  # Ordered list
                "hold_times": {train_id: seconds},
                "crossing_station": station_id or None,
                "solver_stats": {...}
            }
        """
        if not ORTOOLS_AVAILABLE:
            return self._solve_heuristic_single(candidate_conflict, state.get("trains", {}), 
                                                state.get("sections", {}), state.get("stations", {}))
        
        model = cp_model.CpModel()
        
        trains_involved = candidate_conflict.get("trains", [])
        section_id = candidate_conflict.get("section", "")
        
        if len(trains_involved) < 2:
            return {"precedence": trains_involved, "hold_times": {}, "crossing_station": None}
        
        # Get train objects and section info
        trains_dict = state.get("trains", {})
        sections_dict = state.get("sections", {})
        stations_dict = state.get("stations", {})
        
        train_objs = [(tid, trains_dict.get(tid)) for tid in trains_involved if tid in trains_dict]
        if len(train_objs) < 2:
            return {"precedence": trains_involved, "hold_times": {}, "crossing_station": None}
        
        section = sections_dict.get(section_id, {})
        from_station = section.get("from_station", "")
        to_station = section.get("to_station", "")
        
        # Decision variables: precedence binary variables
        precedence_vars = {}
        for tid, _ in train_objs:
            precedence_vars[tid] = model.NewBoolVar(f"prec_{tid}")
        
        # Hold time variables (0 to max_hold seconds)
        max_hold = 1800  # 30 minutes max
        hold_vars = {}
        for tid, _ in train_objs:
            hold_vars[tid] = model.NewIntVar(0, max_hold, f"hold_{tid}")
        
        # Constraint: Exactly one train gets precedence (first to pass)
        model.Add(sum(precedence_vars.values()) == 1)
        
        # Constraints: Train with precedence has hold_time = 0
        for tid, _ in train_objs:
            model.Add(hold_vars[tid] == 0).OnlyEnforceIf(precedence_vars[tid])
            model.Add(hold_vars[tid] >= self.min_headway_seconds).OnlyEnforceIf(precedence_vars[tid].Not())
        
        # Constraints: Minimum headway between trains
        for i, (tid1, train1) in enumerate(train_objs):
            for j, (tid2, train2) in enumerate(train_objs):
                if i != j:
                    # If train1 has precedence, train2 must wait at least min_headway
                    model.Add(hold_vars[tid2] >= hold_vars[tid1] + self.min_headway_seconds).OnlyEnforceIf(precedence_vars[tid1])
        
        # Objective: Minimize weighted delay
        total_delay = []
        for tid, train in train_objs:
            priority = getattr(train, 'priority', 3) if train else 3
            weight = delay_penalty * (6 - priority)  # Higher priority = lower weight
            total_delay.append(hold_vars[tid] * weight)
        
        model.Minimize(sum(total_delay))
        
        # Solve
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 0.8  # Limit to 800ms
        solver.parameters.num_search_workers = 1  # Single thread for consistency
        
        status = solver.Solve(model)
        
        solver_stats = {
            "status": "OPTIMAL" if status == cp_model.OPTIMAL else ("FEASIBLE" if status == cp_model.FEASIBLE else "INFEASIBLE"),
            "solve_time_ms": solver.WallTime() * 1000,
            "objective_value": solver.ObjectiveValue() if status in [cp_model.OPTIMAL, cp_model.FEASIBLE] else None,
        }
        
        if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
            # Extract solution
            precedence_winner = None
            hold_times = {}
            precedence_order = []
            
            for tid, _ in train_objs:
                hold_time = solver.Value(hold_vars[tid])
                hold_times[tid] = int(hold_time)
                if solver.Value(precedence_vars[tid]) == 1:
                    precedence_winner = tid
            
            # Build precedence order (winner first, then by hold time)
            sorted_trains = sorted(train_objs, key=lambda x: hold_times.get(x[0], max_hold))
            precedence_order = [tid for tid, _ in sorted_trains]
            
            # Crossing station for head-on conflicts
            crossing_station = None
            if candidate_conflict.get("type") == "head-on":
                if from_station in stations_dict and stations_dict[from_station].get("is_junction", False):
                    crossing_station = from_station
                elif to_station in stations_dict and stations_dict[to_station].get("is_junction", False):
                    crossing_station = to_station
                else:
                    crossing_station = from_station  # Default
            
            return {
                "precedence": precedence_order,
                "hold_times": hold_times,
                "crossing_station": crossing_station,
                "solver_stats": solver_stats,
            }
        else:
            # Fallback to heuristic
            logger.warning(f"CP-SAT solver failed for conflict, using heuristic")
            return self._solve_heuristic_single(candidate_conflict, trains_dict, sections_dict, stations_dict)
    
    def solve(self, conflicts: List[Dict], trains: Dict[str, Any], 
              sections: Dict[str, Dict], stations: Dict[str, Dict],
              current_time: datetime) -> Dict[str, Any]:
        """
        Solve conflict resolution using CP-SAT (backward compatibility).
        
        Returns:
            Dictionary with resolution decisions
        """
        if not conflicts:
            return {}
        
        # If ortools not available, use heuristic fallback
        if not ORTOOLS_AVAILABLE:
            return self._solve_heuristic(conflicts, trains, sections, stations)
        
        # Build state dict
        state = {
            "trains": trains,
            "sections": sections,
            "stations": stations,
        }
        
        resolutions = {}
        for conflict in conflicts:
            conflict_id = f"{conflict.get('type', 'unknown')}_{conflict.get('section', 'unknown')}"
            solution = self.solve_precedence_problem(state, conflict)
            
            # Convert to old format
            resolutions[conflict_id] = {
                "precedence": solution.get("precedence", [])[0] if solution.get("precedence") else None,
                "wait_times": solution.get("hold_times", {}),
                "crossing_station": solution.get("crossing_station"),
                "hold_time_sec": max(solution.get("hold_times", {}).values()) if solution.get("hold_times") else 0,
                "method": "OR-Tools CP-SAT",
                "optimal": solution.get("solver_stats", {}).get("status") == "OPTIMAL",
            }
        
        return resolutions
    
    def _solve_heuristic(self, conflicts: List[Dict], trains: Dict[str, Any],
                        sections: Dict[str, Dict], stations: Dict[str, Dict]) -> Dict[str, Any]:
        """Heuristic solver when OR-Tools is not available"""
        resolutions = {}
        
        for conflict in conflicts:
            conflict_id = f"{conflict.get('type', 'unknown')}_{conflict.get('section', 'unknown')}"
            section_id = conflict.get("section", "")
            trains_involved = conflict.get("trains", [])
            
            if len(trains_involved) < 2:
                continue
            
            # Get train objects
            train_objs = []
            for tid in trains_involved:
                if tid in trains:
                    train_objs.append((tid, trains[tid]))
            
            if len(train_objs) < 2:
                continue
            
            # Get crossing station
            section = sections.get(section_id, {})
            from_station = section.get("from_station", "")
            to_station = section.get("to_station", "")
            
            crossing_station = None
            if conflict.get("type") == "head-on":
                if from_station in stations and stations[from_station].get("is_junction", False):
                    crossing_station = from_station
                elif to_station in stations and stations[to_station].get("is_junction", False):
                    crossing_station = to_station
                else:
                    crossing_station = from_station
            
            resolutions[conflict_id] = self._heuristic_resolution(conflict, train_objs, crossing_station)
        
        return resolutions
    
    def _solve_heuristic_single(self, conflict: Dict, trains: Dict[str, Any],
                                sections: Dict[str, Dict], stations: Dict[str, Dict]) -> Dict[str, Any]:
        """Heuristic solver for single conflict"""
        trains_involved = conflict.get("trains", [])
        if len(trains_involved) < 2:
            return {"precedence": trains_involved, "hold_times": {}, "crossing_station": None}
        
        train_objs = [(tid, trains.get(tid)) for tid in trains_involved if tid in trains]
        if len(train_objs) < 2:
            return {"precedence": trains_involved, "hold_times": {}, "crossing_station": None}
        
        # Simple heuristic: higher priority train gets precedence
        train_objs_sorted = sorted(train_objs, key=lambda x: getattr(x[1], 'priority', 3) if x[1] else 3, reverse=True)
        precedence_winner = train_objs_sorted[0][0]
        
        hold_times = {}
        precedence_order = []
        for i, (tid, train) in enumerate(train_objs_sorted):
            precedence_order.append(tid)
            if tid == precedence_winner:
                hold_times[tid] = 0
            else:
                # Wait based on priority difference
                winner_priority = getattr(train_objs_sorted[0][1], 'priority', 3) if train_objs_sorted[0][1] else 3
                train_priority = getattr(train, 'priority', 3) if train else 3
                priority_diff = winner_priority - train_priority
                hold_times[tid] = max(self.min_headway_seconds, priority_diff * 60)
        
        # Crossing station
        section_id = conflict.get("section", "")
        section = sections.get(section_id, {})
        from_station = section.get("from_station", "")
        to_station = section.get("to_station", "")
        crossing_station = None
        if conflict.get("type") == "head-on":
            if from_station in stations and stations[from_station].get("is_junction", False):
                crossing_station = from_station
            elif to_station in stations and stations[to_station].get("is_junction", False):
                crossing_station = to_station
            else:
                crossing_station = from_station
        
        return {
            "precedence": precedence_order,
            "hold_times": hold_times,
            "crossing_station": crossing_station,
            "solver_stats": {"status": "HEURISTIC", "solve_time_ms": 0},
        }
    
    def _heuristic_resolution(self, conflict: Dict, train_objs: List[Tuple[str, Any]], 
                             crossing_station: Optional[str]) -> Dict[str, Any]:
        """Fallback heuristic when CP-SAT fails or is unavailable"""
        if not train_objs:
            return {}
        
        # Simple heuristic: higher priority train gets precedence
        train_objs_sorted = sorted(train_objs, key=lambda x: getattr(x[1], 'priority', 3), reverse=True)
        precedence_winner = train_objs_sorted[0][0]
        
        wait_times = {}
        for i, (tid, train) in enumerate(train_objs):
            if tid == precedence_winner:
                wait_times[tid] = 0
            else:
                # Wait based on priority difference
                winner_priority = getattr(train_objs_sorted[0][1], 'priority', 3)
                train_priority = getattr(train, 'priority', 3)
                priority_diff = winner_priority - train_priority
                wait_times[tid] = max(self.min_headway_seconds, priority_diff * 60)
        
        return {
            "precedence": precedence_winner,
            "wait_times": wait_times,
            "crossing_station": crossing_station,
            "hold_time_sec": max(wait_times.values()) if wait_times else 0,
            "method": "Heuristic (OR-Tools not available)",
            "optimal": False,
        }

