from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError, OperationalError, DisconnectionError
import logging
import os
from contextlib import contextmanager

from app.core.config import settings

logger = logging.getLogger(__name__)

# Create engine with connection pooling and pre-ping to handle connection issues
engine = create_engine(
	settings.sync_database_uri,
	echo=settings.SQLALCHEMY_ECHO,
	pool_pre_ping=True,  # Verify connections before using them
	pool_recycle=3600,   # Recycle connections after 1 hour
	pool_size=5,         # Number of connections to maintain
	max_overflow=10,     # Maximum number of connections to create beyond pool_size
	connect_args={"check_same_thread": False} if "sqlite" in settings.sync_database_uri.lower() else {}
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def test_connection() -> tuple[bool, str]:
	"""Test database connection and return (success, error_message)"""
	try:
		with engine.connect() as conn:
			conn.execute(text("SELECT 1"))
		return True, ""
	except OperationalError as e:
		error_msg = str(e)
		error_lower = error_msg.lower()
		
		# Check for DNS/hostname resolution errors
		if "name or service not known" in error_lower or "errno -2" in error_lower:
			is_render = os.getenv("RENDER") is not None
			if is_render:
				return False, (
					"Database hostname cannot be resolved. This usually means:\n"
					"1. DATABASE_URL is not set - Make sure you have linked a PostgreSQL database to your web service in Render.\n"
					"2. The database service is not running or has been deleted.\n"
					"3. The database hostname in DATABASE_URL is incorrect.\n\n"
					"To fix: Go to your Render dashboard, ensure you have a PostgreSQL database service, "
					"and link it to your web service. The DATABASE_URL will be automatically set."
				)
			else:
				return False, (
					f"Database hostname cannot be resolved. Check that:\n"
					f"1. DB_HOST is set correctly (current: {settings.DB_HOST})\n"
					f"2. The database server is running and accessible\n"
					f"3. Your network/DNS can resolve the hostname\n"
					f"4. If using DATABASE_URL, verify the hostname in the connection string is correct"
				)
		elif "could not connect" in error_lower or "connection refused" in error_lower:
			return False, f"Database server is not reachable. Check if the database is running and accessible at {settings.DB_HOST}:{settings.DB_PORT}"
		elif "authentication failed" in error_lower or "password" in error_lower:
			return False, "Database authentication failed. Check your DB_USER and DB_PASSWORD credentials."
		elif "does not exist" in error_lower or "database" in error_lower:
			return False, f"Database '{settings.DB_NAME}' does not exist. Please create it first."
		else:
			return False, f"Database connection error: {error_msg}"
	except Exception as e:
		return False, f"Unexpected database error: {str(e)}"


@contextmanager
def get_db_session():
	"""Context manager for database sessions with better error handling"""
	db = None
	try:
		db = SessionLocal()
		# Test connection before yielding
		try:
			db.execute(text("SELECT 1"))
		except (OperationalError, DisconnectionError) as e:
			error_msg = str(e)
			error_lower = error_msg.lower()
			
			# Provide helpful error messages for common issues
			if "name or service not known" in error_lower or "errno -2" in error_lower:
				is_render = os.getenv("RENDER") is not None
				if is_render:
					logger.error(
						"Database hostname resolution failed. This usually means DATABASE_URL is not set "
						"or the database service is not linked. Check your Render dashboard to ensure "
						"the PostgreSQL database is linked to this web service."
					)
				else:
					logger.error(
						f"Database hostname resolution failed. Check DB_HOST={settings.DB_HOST} "
						f"or DATABASE_URL connection string."
					)
			else:
				logger.error(f"Database connection test failed: {error_msg}", exc_info=True)
			
			if db:
				db.close()
			# Re-raise the original exception with additional context
			raise
		yield db
	except SQLAlchemyError as e:
		logger.error(f"Database session error: {str(e)}", exc_info=True)
		if db:
			db.rollback()
		raise
	except Exception as e:
		logger.error(f"Unexpected error in database session: {str(e)}", exc_info=True)
		if db:
			db.rollback()
		raise
	finally:
		if db:
			db.close()


def get_db():
	"""Dependency function for FastAPI routes"""
	db = None
	try:
		db = SessionLocal()
		# Test connection before yielding
		try:
			db.execute(text("SELECT 1"))
		except (OperationalError, DisconnectionError) as e:
			error_msg = str(e)
			error_lower = error_msg.lower()
			
			# Provide helpful error messages for common issues
			if "name or service not known" in error_lower or "errno -2" in error_lower:
				is_render = os.getenv("RENDER") is not None
				if is_render:
					logger.error(
						"Database hostname resolution failed. This usually means DATABASE_URL is not set "
						"or the database service is not linked. Check your Render dashboard to ensure "
						"the PostgreSQL database is linked to this web service."
					)
				else:
					logger.error(
						f"Database hostname resolution failed. Check DB_HOST={settings.DB_HOST} "
						f"or DATABASE_URL connection string."
					)
			else:
				logger.error(f"Database connection test failed: {error_msg}", exc_info=True)
			
			if db:
				db.close()
			# Re-raise the original exception with additional context
			raise
		yield db
	except SQLAlchemyError as e:
		logger.error(f"Database session error: {str(e)}", exc_info=True)
		if db:
			db.rollback()
		raise
	except Exception as e:
		logger.error(f"Unexpected error in database session: {str(e)}", exc_info=True)
		if db:
			db.rollback()
		raise
	finally:
		if db:
			db.close()


