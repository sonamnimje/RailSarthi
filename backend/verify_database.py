#!/usr/bin/env python3
"""
Script to verify database connection and ensure tables are created.
Run this after setting up the Render database to verify everything works.
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from app.db.session import SessionLocal, engine
from app.db.models import Base, User
from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def verify_database():
    """Verify database connection and create tables if needed."""
    try:
        # Test connection
        logger.info("Testing database connection...")
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            logger.info("✓ Database connection successful!")
        
        # Create tables
        logger.info("Creating/verifying database tables...")
        Base.metadata.create_all(bind=engine)
        logger.info("✓ Tables created/verified successfully!")
        
        # Check if users table exists and has data
        db = SessionLocal()
        try:
            user_count = db.query(User).count()
            logger.info(f"✓ Users table exists with {user_count} users")
        except Exception as e:
            logger.error(f"✗ Error querying users: {e}")
        finally:
            db.close()
        
        logger.info("\n✅ Database setup complete!")
        return True
        
    except Exception as e:
        logger.error(f"✗ Database verification failed: {e}")
        logger.error("Please check:")
        logger.error("  1. DATABASE_URL environment variable is set correctly")
        logger.error("  2. Database is accessible from your network")
        logger.error("  3. Database credentials are correct")
        return False

if __name__ == "__main__":
    success = verify_database()
    sys.exit(0 if success else 1)

