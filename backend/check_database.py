#!/usr/bin/env python3
"""
Database connection diagnostic script.
Run this to check if your database configuration is correct.
"""
import os
import sys
from pathlib import Path

# Add the backend directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from app.core.config import settings
from app.db.session import test_connection, engine

def main():
    print("=" * 60)
    print("Database Connection Diagnostic")
    print("=" * 60)
    print()
    
    print("Configuration:")
    print(f"  DB_TYPE: {settings.DB_TYPE}")
    print(f"  DB_HOST: {settings.DB_HOST}")
    print(f"  DB_PORT: {settings.DB_PORT}")
    print(f"  DB_USER: {settings.DB_USER}")
    print(f"  DB_PASSWORD: {'*' * len(settings.DB_PASSWORD) if settings.DB_PASSWORD else '(not set)'}")
    print(f"  DB_NAME: {settings.DB_NAME}")
    print(f"  DATABASE_URL: {'(set)' if settings.DATABASE_URL else '(not set)'}")
    print(f"  SQLITE_PATH: {settings.SQLITE_PATH or '(not set)'}")
    print()
    
    print("Database URI (masked):")
    uri = settings.sync_database_uri
    if settings.DB_PASSWORD:
        uri = uri.replace(settings.DB_PASSWORD, "***")
    print(f"  {uri}")
    print()
    
    print("Testing connection...")
    connection_ok, error_msg = test_connection()
    
    if connection_ok:
        print("✓ Database connection successful!")
        print()
        print("Testing basic query...")
        try:
            from sqlalchemy import text
            with engine.connect() as conn:
                result = conn.execute(text("SELECT 1 as test"))
                row = result.fetchone()
                if row and row[0] == 1:
                    print("✓ Query test successful!")
                else:
                    print("⚠ Query returned unexpected result")
        except Exception as e:
            print(f"✗ Query test failed: {e}")
    else:
        print("✗ Database connection failed!")
        print()
        print("Error details:")
        print(f"  {error_msg}")
        print()
        print("Troubleshooting steps:")
        print("  1. Check if the database server is running")
        if settings.DB_TYPE == "postgresql":
            print(f"  2. Verify PostgreSQL is accessible at {settings.DB_HOST}:{settings.DB_PORT}")
            print("  3. Check your DB_USER and DB_PASSWORD credentials")
            print(f"  4. Ensure the database '{settings.DB_NAME}' exists")
            print("  5. Check firewall/network settings")
        elif settings.DB_TYPE == "sqlite":
            db_path = settings.SQLITE_PATH or f"{settings.DB_NAME}.db"
            print(f"  2. Check if SQLite file exists and is writable: {db_path}")
            print("  3. Verify directory permissions")
        print()
    
    print("=" * 60)
    return 0 if connection_ok else 1

if __name__ == "__main__":
    sys.exit(main())

