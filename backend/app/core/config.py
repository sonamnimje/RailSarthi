import os
import logging
from dotenv import load_dotenv

# Reload .env file to pick up changes
load_dotenv(override=True)  # override=True ensures new values replace old ones

logger = logging.getLogger(__name__)


class Settings:
	APP_NAME: str = os.getenv("APP_NAME", "RailAnukriti")
	ENV: str = os.getenv("ENV", "dev")
	API_PREFIX: str = os.getenv("API_PREFIX", "/api")
	SECRET_KEY: str = os.getenv("SECRET_KEY", "change-this-secret")
	ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
	JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")

	DB_TYPE: str = os.getenv("DB_TYPE", "sqlite")  # 'sqlite' or 'postgresql'
	DB_HOST: str = os.getenv("DB_HOST", "localhost")
	DB_PORT: str = os.getenv("DB_PORT", "5432")
	DB_USER: str = os.getenv("DB_USER", "postgres")
	DB_PASSWORD: str = os.getenv("DB_PASSWORD", "postgres")
	DB_NAME: str = os.getenv("DB_NAME", "rail")
	# Optional explicit path for SQLite files (useful on platforms with read-only project dirs)
	SQLITE_PATH: str | None = os.getenv("SQLITE_PATH")
	# Full SQLAlchemy URL for managed DBs
	DATABASE_URL: str | None = os.getenv("DATABASE_URL")

	SQLALCHEMY_ECHO: bool = os.getenv("SQLALCHEMY_ECHO", "false").lower() == "true"

	# RapidAPI IRCTC configuration removed
	
	# Weather API configuration
	WEATHER_API_KEY: str | None = os.getenv("WEATHER_API_KEY")
	WEATHER_API_PROVIDER: str = os.getenv("WEATHER_API_PROVIDER", "openweather")
	
	def __init__(self):
		"""Validate database configuration on initialization"""
		self._validate_database_config()
	
	def _validate_database_config(self):
		"""Validate database configuration and log warnings"""
		is_render = os.getenv("RENDER") is not None
		
		if self.DB_TYPE == "postgresql":
			if not self.DATABASE_URL:
				if is_render:
					logger.warning(
						"DATABASE_URL is not set. On Render, make sure you have linked a PostgreSQL database "
						"to your web service. The DATABASE_URL should be automatically set when you link the database."
					)
				else:
					logger.warning(
						f"DATABASE_URL is not set. Falling back to individual DB_* variables. "
						f"Using DB_HOST={self.DB_HOST}, DB_PORT={self.DB_PORT}, DB_NAME={self.DB_NAME}"
					)
					if self.DB_HOST == "localhost" and is_render:
						logger.error(
							"DB_HOST is set to 'localhost' which will not work on Render. "
							"Please set DATABASE_URL or ensure your database service is properly linked."
						)
			else:
				# Log that DATABASE_URL is set (but don't log the actual URL for security)
				logger.info("DATABASE_URL is set (using provided connection string)")

	@property
	def sync_database_uri(self) -> str:
		# Prefer a provided DATABASE_URL when not using sqlite
		if self.DATABASE_URL and self.DB_TYPE != "sqlite":
			url = self.DATABASE_URL
			# Convert postgres:// to postgresql+psycopg://
			if url.startswith("postgres://"):
				url = "postgresql+psycopg://" + url[len("postgres://"):]
			elif url.startswith("postgresql://"):
				url = "postgresql+psycopg://" + url[len("postgresql://"):]
			# Ensure it starts with postgresql+psycopg://
			if not url.startswith("postgresql+psycopg://"):
				url = "postgresql+psycopg://" + url
			logger.debug(f"Using DATABASE_URL for connection (hostname masked)")
			return url
		if self.DB_TYPE == "sqlite":
			# Prefer explicit SQLITE_PATH. On Render or non-dev, default to /tmp which is writable.
			if self.SQLITE_PATH:
				db_path = self.SQLITE_PATH
			else:
				is_render = os.getenv("RENDER") is not None
				# On Render, the writable location is /tmp; avoid /var/data which may be readonly
				if is_render or self.ENV != "dev":
					base_dir = "/tmp"
				else:
					base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
				db_path = os.path.join(base_dir, f"{self.DB_NAME}.db")
			# Ensure directory exists to avoid OperationalError on first run
			os.makedirs(os.path.dirname(db_path), exist_ok=True)
			return f"sqlite:///{db_path}"
		# Fallback to constructing from individual components
		uri = f"postgresql+psycopg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
		logger.debug(f"Constructed database URI from individual components (host={self.DB_HOST}, port={self.DB_PORT})")
		return uri

	@property
	def async_database_uri(self) -> str:
		# Prefer a provided DATABASE_URL for async as well
		if self.DATABASE_URL and self.DB_TYPE != "sqlite":
			url = self.DATABASE_URL
			# Convert postgres:// to postgresql+asyncpg://
			if url.startswith("postgres://"):
				url = "postgresql+asyncpg://" + url[len("postgres://"):]
			elif url.startswith("postgresql://"):
				url = "postgresql+asyncpg://" + url[len("postgresql://"):]
			# Ensure it starts with postgresql+asyncpg://
			if not url.startswith("postgresql+asyncpg://"):
				url = "postgresql+asyncpg://" + url
			return url
		if self.DB_TYPE == "sqlite":
			if self.SQLITE_PATH:
				db_path = self.SQLITE_PATH
			else:
				is_render = os.getenv("RENDER") is not None
				# On Render, the writable location is /tmp; avoid /var/data which may be readonly
				if is_render or self.ENV != "dev":
					base_dir = "/tmp"
				else:
					base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
				db_path = os.path.join(base_dir, f"{self.DB_NAME}.db")
			os.makedirs(os.path.dirname(db_path), exist_ok=True)
			return f"sqlite+aiosqlite:///{db_path}"
		return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"


settings = Settings()


