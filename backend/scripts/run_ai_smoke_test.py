#!/usr/bin/env python3
"""
Smoke test script for AI recommendation system.
Loads sample dataset and runs one loop generating recommendations.
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.division_loader import load_division_dataset
from app.simulation.digital_twin_engine import DigitalTwinEngine
from app.services.ai_engine import RecommendationEngine
import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    """Run smoke test"""
    print("=" * 60)
    print("AI Recommendation System Smoke Test")
    print("=" * 60)
    
    # Load division dataset
    division = "mumbai"
    print(f"\n1. Loading division dataset: {division}")
    try:
        dataset = load_division_dataset(division)
        print(f"   ✓ Loaded dataset with {len(dataset.get('stations', []))} stations")
    except Exception as e:
        print(f"   ✗ Failed to load dataset: {e}")
        return 1
    
    # Create engine
    print(f"\n2. Creating DigitalTwinEngine...")
    try:
        engine = DigitalTwinEngine(dataset)
        engine.start()
        print(f"   ✓ Engine created: {len(engine.stations)} stations, {len(engine.sections)} sections, {len(engine.trains)} trains")
    except Exception as e:
        print(f"   ✗ Failed to create engine: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    # Advance simulation a bit to generate some state
    print(f"\n3. Advancing simulation...")
    try:
        for i in range(5):
            await engine.tick(dt=1.0)
        print(f"   ✓ Simulation advanced 5 seconds")
    except Exception as e:
        print(f"   ✗ Failed to advance simulation: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    # Get state
    print(f"\n4. Getting engine state...")
    try:
        state = engine.get_state()
        conflicts = state.get("conflicts", [])
        print(f"   ✓ State retrieved: {len(state.get('trains', []))} trains, {len(conflicts)} conflicts")
    except Exception as e:
        print(f"   ✗ Failed to get state: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    # Generate recommendations
    print(f"\n5. Generating AI recommendations...")
    try:
        ai_engine = RecommendationEngine()
        recommendations = ai_engine.generate_recommendations(state)
        print(f"   ✓ Generated {len(recommendations)} recommendations")
        
        if recommendations:
            print(f"\n   Sample recommendation:")
            rec = recommendations[0]
            print(f"     - Conflict ID: {rec.get('conflict_id')}")
            print(f"     - Confidence: {rec.get('confidence', 0):.2%}")
            print(f"     - Explanation: {rec.get('explanation', '')[:100]}...")
            print(f"     - Solution: {rec.get('solution', {})}")
        else:
            print(f"   (No conflicts detected, so no recommendations generated)")
    except Exception as e:
        print(f"   ✗ Failed to generate recommendations: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    print(f"\n" + "=" * 60)
    print("✓ Smoke test completed successfully!")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)

