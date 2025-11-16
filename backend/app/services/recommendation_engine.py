"""Basic rule-based recommendation engine.

This is intentionally lightweight and deterministic: detects simple conflicts
where multiple trains occupy the same section at overlapping times and
recommends actions (hold, slow_down, platform_change).
"""
from typing import List, Dict, Any
from datetime import datetime


def detect_section_conflicts(timelines: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Detect conflicts from train timelines.

    timelines: {train_id: [ {section_id, enter_ts, exit_ts}, ... ] }
    Returns list of conflict records with simple recommendations.
    """
    # Flatten occupancy events by section
    section_occupancies: Dict[str, List[Dict[str, Any]]] = {}
    for train_id, events in timelines.items():
        for ev in events:
            section = ev.get("section_id")
            enter = float(ev.get("enter_ts", 0))
            exit = float(ev.get("exit_ts", enter + 60))
            section_occupancies.setdefault(section, []).append({"train_id": train_id, "enter": enter, "exit": exit})

    conflicts: List[Dict[str, Any]] = []
    for section, occs in section_occupancies.items():
        # sort by enter time
        occs.sort(key=lambda o: o["enter"])
        for i in range(len(occs)):
            for j in range(i + 1, len(occs)):
                a = occs[i]
                b = occs[j]
                # overlap if enter_b < exit_a
                if b["enter"] < a["exit"]:
                    # conflict detected
                    overlap = min(a["exit"], b["exit"]) - max(a["enter"], b["enter"])
                    severity = "low"
                    if overlap > 300:
                        severity = "high"
                    elif overlap > 60:
                        severity = "medium"
                    # recommend: lower priority train hold or slow down
                    rec = {
                        "section_id": section,
                        "trains": [a["train_id"], b["train_id"]],
                        "overlap_seconds": overlap,
                        "severity": severity,
                        "recommendation": "hold_second_train" if severity != "high" else "reroute_or_hold",
                    }
                    conflicts.append(rec)

    return conflicts


def make_recommendations(timelines: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
    conflicts = detect_section_conflicts(timelines)
    recommendations = []
    for c in conflicts:
        for t in c["trains"]:
            recommendations.append({
                "train_id": t,
                "action": c["recommendation"],
                "reason": f"overlap {c['overlap_seconds']}s on {c['section_id']}",
                "severity": c["severity"],
            })

    return {"conflicts": conflicts, "recommendations": recommendations}
