from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import ingest, optimizer, simulator, overrides, ws, users, reports, train_logs
from .db.session import engine, SessionLocal, test_connection
from .db.models import Base
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
import os
import logging

from .core.config import settings

# Configure logging
logging.basicConfig(
	level=logging.INFO,
	format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# When running from backend/ (Render rootDir), this import is available
try:
	from migrate_sqlite_to_postgres import migrate as migrate_sqlite_to_pg
except Exception:
	migrate_sqlite_to_pg = None  # type: ignore


def create_app() -> FastAPI:

	app = FastAPI(
		title="RailAnukriti Backend",
		description="AI-powered smart train traffic optimizer backend (FastAPI)",
		version="0.1.0",
	)

	# Explicit CORS origins: wildcard with credentials is not permitted by browsers
	allowed_origins = [
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"https://rail-anukriti-7u8e.vercel.app",
	]
	# Allow override via env var (comma-separated)
	env_origins = os.getenv("CORS_ALLOW_ORIGINS")
	if env_origins:
		allowed_origins = [o.strip() for o in env_origins.split(",") if o.strip()]

	app.add_middleware(
		CORSMiddleware,
		allow_origins=allowed_origins,
		allow_credentials=True,
		allow_methods=["*"],
		allow_headers=["*"],
	)

	app.include_router(ingest.router, prefix="/api/ingest", tags=["ingest"])
	app.include_router(optimizer.router, prefix="/api/optimizer", tags=["optimizer"])
	app.include_router(simulator.router, prefix="/api/simulator", tags=["simulator"])
	app.include_router(overrides.router, prefix="/api/overrides", tags=["overrides"])
	app.include_router(users.router, prefix="/api/users", tags=["users"])
	app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
	app.include_router(train_logs.router, prefix="/api/train-logs", tags=["train-logs"])
	app.include_router(ws.router, tags=["ws"])  # exposes /ws/live

	# Ensure database tables exist on startup
	@app.on_event("startup")
	def on_startup() -> None:
		# Test database connection first
		logger.info(f"Testing database connection to {settings.DB_TYPE} database...")
		connection_ok, error_msg = test_connection()
		if not connection_ok:
			logger.error(f"Database connection test failed: {error_msg}")
			logger.error("Application will continue to start, but database operations may fail.")
			logger.error(f"Database URI: {settings.sync_database_uri.replace(settings.DB_PASSWORD, '***') if settings.DB_PASSWORD else settings.sync_database_uri}")
		else:
			logger.info("Database connection test successful")
		
		# If using Postgres on Render, attempt a one-time SQLite -> Postgres migration
		# This is safe to run repeatedly; the migration is idempotent and will skip if dest has data
		if settings.DB_TYPE == "postgresql" and migrate_sqlite_to_pg is not None:
			try:
				# Default location of local SQLite when running from backend/
				sqlite_path = os.getenv("SQLITE_SOURCE_PATH", "app/rail.db")
				postgres_url = os.getenv("DATABASE_URL")
				if postgres_url and os.path.exists(sqlite_path):
					migrate_sqlite_to_pg(f"sqlite:///{sqlite_path}", postgres_url)
			except Exception:
				# Never block startup on migration issues
				pass

		# Ensure tables exist on current engine
		try:
			Base.metadata.create_all(bind=engine)
			logger.info("Database tables created/verified successfully")
		except SQLAlchemyError as e:
			logger.error(f"Failed to create database tables: {str(e)}", exc_info=True)
			# Don't block startup, but log the error
		except Exception as e:
			logger.error(f"Unexpected error during table creation: {str(e)}", exc_info=True)

		# Optional: seed demo data once if enabled and database appears empty
		if os.getenv("SEED_ON_STARTUP", "false").lower() == "true":
			try:
				from app.db.models import Train, TrainSchedule, TrainLog
				from seed_train_data import seed_data
				with SessionLocal() as db:
					# Acquire DB-level advisory lock to prevent concurrent seeding
					try:
						lock_acquired = db.execute(text("SELECT pg_try_advisory_lock( hashtext('rail_seed_lock') )")).scalar()
					except Exception:
						lock_acquired = True  # On SQLite or if advisory lock unsupported
					if lock_acquired:
						trains_count = db.query(Train).count()
						schedules_count = db.query(TrainSchedule).count()
						logs_count = db.query(TrainLog).count()
						if trains_count == 0 and schedules_count == 0 and logs_count == 0:
							seed_data()
						# Release lock if Postgres
						try:
							db.execute(text("SELECT pg_advisory_unlock( hashtext('rail_seed_lock') )"))
						except Exception:
							pass
			except Exception:
				# Never block startup on seed issues
				pass
		# Lightweight migration: ensure overrides.ai_action exists (SQLite-safe)
		try:
			with engine.connect() as conn:
				try:
					conn.execute(text("ALTER TABLE overrides ADD COLUMN ai_action TEXT"))
					conn.commit()
					logger.info("Migration: added ai_action column to overrides table")
				except Exception:
					# Column likely exists; ignore
					pass
		except SQLAlchemyError as e:
			logger.warning(f"Could not run migration check: {str(e)}")
		except Exception as e:
			logger.warning(f"Unexpected error during migration check: {str(e)}")

	@app.get("/health")
	def health() -> dict:
		return {"status": "ok"}

	@app.get("/")
	def root() -> dict:
		return {"message": "RailAnukriti backend is running"}

	return app


app = create_app()


