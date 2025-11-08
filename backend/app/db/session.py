from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError, OperationalError, DisconnectionError
import logging
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
		if "could not connect" in error_msg.lower() or "connection refused" in error_msg.lower():
			return False, f"Database server is not reachable. Check if the database is running and accessible at {settings.DB_HOST}:{settings.DB_PORT}"
		elif "authentication failed" in error_msg.lower() or "password" in error_msg.lower():
			return False, "Database authentication failed. Check your DB_USER and DB_PASSWORD credentials."
		elif "does not exist" in error_msg.lower() or "database" in error_msg.lower():
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
			logger.error(f"Database connection test failed: {str(e)}", exc_info=True)
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
			logger.error(f"Database connection test failed: {str(e)}", exc_info=True)
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


