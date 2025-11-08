from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Create engine with connection pooling and pre-ping to handle connection issues
engine = create_engine(
	settings.sync_database_uri,
	echo=settings.SQLALCHEMY_ECHO,
	pool_pre_ping=True,  # Verify connections before using them
	pool_recycle=3600,   # Recycle connections after 1 hour
	pool_size=5,         # Number of connections to maintain
	max_overflow=10       # Maximum number of connections to create beyond pool_size
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db():
	db = SessionLocal()
	try:
		yield db
	except SQLAlchemyError as e:
		logger.error(f"Database session error: {str(e)}", exc_info=True)
		db.rollback()
		raise
	finally:
		db.close()


