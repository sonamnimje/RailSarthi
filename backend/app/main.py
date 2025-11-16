from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.routes import ingest, optimizer, simulator, overrides, ws, users, reports, train_logs, train_live, weather, train_realtime, ai_routes
from .api.routes import live_routes, weather_routes
from .api.routes import recommendations
from .db.session import engine, SessionLocal, test_connection
from .db.models import Base
from .db import models_sim  # Import to register OverrideLog model
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
	app.include_router(train_live.router, prefix="/api/live", tags=["live-train"])
	app.include_router(ws.router, tags=["ws"])# exposes /ws/live
	app.include_router(weather.router, prefix="/api", tags=["weather"])
	app.include_router(train_realtime.router, prefix=f"{settings.API_PREFIX}/live")
	app.include_router(ai_routes.router)  # exposes /api/ai/* endpoints
	app.include_router(live_routes.router)  # exposes /api/live/* endpoints
	app.include_router(weather_routes.router)  # exposes /api/weather/* endpoints
	# Recommendations API
	app.include_router(recommendations.router, prefix="/api/recommendations", tags=["recommendations"])


	# Ensure database tables exist on startup
	@app.on_event("startup")
	def on_startup() -> None:
		# Log database configuration (without sensitive data)
		is_render = os.getenv("RENDER") is not None
		logger.info(f"Database configuration: DB_TYPE={settings.DB_TYPE}, ENV={settings.ENV}, RENDER={is_render}")
		if settings.DATABASE_URL:
			# Mask password in DATABASE_URL for logging
			masked_url = settings.DATABASE_URL
			if "@" in masked_url and ":" in masked_url.split("@")[0]:
				parts = masked_url.split("@")
				user_pass = parts[0].split("://")[-1] if "://" in parts[0] else parts[0]
				if ":" in user_pass:
					user, _ = user_pass.split(":", 1)
					masked_url = masked_url.replace(user_pass, f"{user}:***")
			logger.info(f"DATABASE_URL is set (masked): {masked_url.split('@')[0]}@***")
		else:
			logger.warning("DATABASE_URL is not set. Using individual DB_* environment variables.")
			if settings.DB_TYPE == "postgresql" and is_render:
				logger.error(
					"⚠️  WARNING: DATABASE_URL is not set on Render. "
					"Make sure you have linked a PostgreSQL database to your web service in the Render dashboard."
				)
		
		# Test database connection first
		logger.info(f"Testing database connection to {settings.DB_TYPE} database...")
		connection_ok, error_msg = test_connection()
		if not connection_ok:
			logger.error(f"Database connection test failed: {error_msg}")
			logger.error("Application will continue to start, but database operations may fail.")
			# Log masked database URI for debugging
			masked_uri = settings.sync_database_uri
			if settings.DB_PASSWORD:
				masked_uri = masked_uri.replace(settings.DB_PASSWORD, "***")
			logger.error(f"Database URI (masked): {masked_uri}")
		else:
			logger.info("✓ Database connection test successful")
		
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


	@app.on_event("shutdown")
	async def on_shutdown() -> None:
		pass

	@app.get("/health")
	def health() -> dict:
		return {"status": "ok"}

	@app.get("/")
	def root() -> dict:
		return {"message": "RailAnukriti backend is running"}

	return app


app = create_app()


