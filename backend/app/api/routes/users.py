from datetime import timedelta, datetime, timezone
from typing import Optional
import logging
import re
import random
import string
import hashlib
import time

from fastapi import APIRouter, Depends, HTTPException, status, Form
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, model_validator, ValidationError
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, OperationalError
from sqlalchemy import text

from app.core.config import settings
from app.db.session import get_db
from app.db.models import User

logger = logging.getLogger(__name__)

# In-memory CAPTCHA store (in production, consider using Redis)
captcha_store: dict[str, dict[str, any]] = {}
CAPTCHA_EXPIRY_SECONDS = 300  # 5 minutes

# Common passwords to reject
COMMON_PASSWORDS = {
    "password", "123456", "123456789", "qwerty", "111111", "password1", 
    "12345678", "admin", "letmein", "iloveyou", "welcome", "monkey", 
    "1234567", "123123", "sunshine", "princess", "football", "1234567890"
}

# Password regex: min 12 chars, uppercase, lowercase, digit, special char
PASSWORD_REGEX = re.compile(
    r'^(?=.{12,}$)(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[{\]};:\'",.<>/?\\|`~]).*$'
)


router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/users/login")
password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CaptchaResponse(BaseModel):
    captcha_id: str
    captcha_text: str


class CaptchaVerify(BaseModel):
    captcha_id: str
    captcha_answer: str


def generate_captcha() -> tuple[str, str]:
    """Generate a new CAPTCHA challenge. Returns (captcha_id, captcha_text)"""
    # Generate a random 5-character alphanumeric string
    captcha_text = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
    # Create a unique ID for this CAPTCHA
    captcha_id = hashlib.sha256(
        f"{captcha_text}{time.time()}{random.random()}".encode()
    ).hexdigest()[:16]
    
    # Store the CAPTCHA with expiration
    captcha_store[captcha_id] = {
        "text": captcha_text.upper(),  # Store uppercase for case-insensitive comparison
        "created_at": time.time()
    }
    
    # Clean up expired CAPTCHAs
    current_time = time.time()
    expired_keys = [
        key for key, value in captcha_store.items()
        if current_time - value["created_at"] > CAPTCHA_EXPIRY_SECONDS
    ]
    for key in expired_keys:
        captcha_store.pop(key, None)
    
    return captcha_id, captcha_text


def verify_captcha(captcha_id: str, captcha_answer: str) -> bool:
    """Verify a CAPTCHA answer. Returns True if valid, False otherwise."""
    if not captcha_id or not captcha_answer:
        return False
    
    captcha_data = captcha_store.get(captcha_id)
    if not captcha_data:
        return False
    
    # Check expiration
    current_time = time.time()
    if current_time - captcha_data["created_at"] > CAPTCHA_EXPIRY_SECONDS:
        captcha_store.pop(captcha_id, None)
        return False
    
    # Case-insensitive comparison
    is_valid = captcha_data["text"].upper() == captcha_answer.upper().strip()
    
    # Remove used CAPTCHA (one-time use)
    if captcha_id in captcha_store:
        captcha_store.pop(captcha_id, None)
    
    return is_valid


def validate_strong_password(
    password: str, 
    username: Optional[str] = None
) -> None:
    """
    Validate password strength according to security requirements.
    Raises ValueError with descriptive message if validation fails.
    """
    errors = []
    
    # Check common passwords
    if password.lower() in COMMON_PASSWORDS:
        raise ValueError("This password is too common. Please choose a more unique password.")
    
    # Check regex pattern (length, uppercase, lowercase, digit, special)
    if not PASSWORD_REGEX.match(password):
        errors.append("Password must be at least 12 characters and include uppercase, lowercase, number and special character.")
    
    # Check similarity to username
    if username:
        username_lower = username.lower()
        # Extract email prefix if it's an email
        if '@' in username_lower:
            email_prefix = username_lower.split('@')[0]
            if len(email_prefix) >= 3 and email_prefix in password.lower():
                errors.append("Password is too similar to your email. Try using unrelated words or a passphrase.")
        else:
            if len(username_lower) >= 3 and username_lower in password.lower():
                errors.append("Password is too similar to your username. Try using unrelated words or a passphrase.")
    
    if errors:
        raise ValueError(" ".join(errors))


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "controller"
    captcha_id: Optional[str] = None
    captcha_answer: Optional[str] = None
    
    @model_validator(mode='after')
    def validate_password(self) -> 'UserCreate':
        """Validate password strength using Pydantic validator"""
        validate_strong_password(self.password, self.username)
        return self


class UserRead(BaseModel):
    id: int
    username: str
    role: str


def hash_password(raw_password: str) -> str:
    return password_context.hash(raw_password)


def verify_password(raw_password: str, hashed_password: str) -> bool:
    return password_context.verify(raw_password, hashed_password)


def create_access_token(subject: str, role: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode = {"sub": subject, "role": role, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        username: str = payload.get("sub")  # type: ignore[assignment]
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    try:
        user: User | None = db.query(User).filter(User.username == username).first()
        if user is None:
            raise credentials_exception
        return user
    except OperationalError as e:
        logger.error(f"Database connection error in get_current_user: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection error. Please try again later."
        )
    except SQLAlchemyError as e:
        logger.error(f"Database error in get_current_user: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database error. Please try again later."
        )


def require_role(*allowed_roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return dependency


@router.get("/captcha", response_model=CaptchaResponse)
def get_captcha() -> CaptchaResponse:
    """Generate a new CAPTCHA challenge"""
    captcha_id, captcha_text = generate_captcha()
    return CaptchaResponse(captcha_id=captcha_id, captcha_text=captcha_text)


@router.post("/signup", response_model=UserRead)
def signup(payload: UserCreate, db: Session = Depends(get_db)) -> UserRead:
    try:
        # Validate CAPTCHA
        if not payload.captcha_id or not payload.captcha_answer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CAPTCHA is required"
            )
        if not verify_captcha(payload.captcha_id, payload.captcha_answer):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid CAPTCHA. Please try again."
            )
        
        existing = db.query(User).filter(User.username == payload.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
        user = User(
            username=payload.username,
            hashed_password=hash_password(payload.password),
            role=payload.role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return UserRead(id=user.id, username=user.username, role=user.role)
    except ValidationError as e:
        # Extract password validation errors
        password_errors = []
        for error in e.errors():
            if error.get('loc') and 'password' in error.get('loc', []):
                password_errors.append(error.get('msg', 'Password validation failed'))
        if password_errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"password": password_errors}
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Validation error: " + str(e)
        )
    except HTTPException:
        raise
    except OperationalError as e:
        error_msg = str(e)
        logger.error(f"Database connection error during signup: {error_msg}", exc_info=True)
        if "could not connect" in error_msg.lower() or "connection refused" in error_msg.lower():
            detail = f"Database server is not reachable. Please check if the database is running at {settings.DB_HOST}:{settings.DB_PORT}"
        elif "authentication failed" in error_msg.lower():
            detail = "Database authentication failed. Please check your database credentials."
        elif "does not exist" in error_msg.lower():
            detail = f"Database '{settings.DB_NAME}' does not exist. Please create it first."
        else:
            detail = f"Database connection error: {error_msg}"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail
        )
    except SQLAlchemyError as e:
        logger.error(f"Database error during signup: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Unexpected error during signup: {str(e)}", exc_info=True)
        # In development, return the actual exception detail to aid debugging.
        if settings.ENV == "dev":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(e)
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred. Please try again later."
        )


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    captcha_id: Optional[str] = Form(None),
    captcha_answer: Optional[str] = Form(None),
    db: Session = Depends(get_db)
) -> Token:
    try:
        # Validate CAPTCHA if provided (required for manual logins, optional for auto-login after signup)
        if captcha_id and captcha_answer:
            if not verify_captcha(captcha_id, captcha_answer):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid CAPTCHA. Please try again."
                )
        # Note: CAPTCHA is optional for login to allow auto-login after signup
        # In production, you might want to make it required or use a different mechanism
        
        user: User | None = db.query(User).filter(User.username == form_data.username).first()
        if user is None or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password")
        access_token = create_access_token(str(user.username), user.role)
        return Token(access_token=access_token)
    except HTTPException:
        raise
    except OperationalError as e:
        error_msg = str(e)
        logger.error(f"Database connection error during login: {error_msg}", exc_info=True)
        if "could not connect" in error_msg.lower() or "connection refused" in error_msg.lower():
            detail = f"Database server is not reachable. Please check if the database is running at {settings.DB_HOST}:{settings.DB_PORT}"
        elif "authentication failed" in error_msg.lower():
            detail = "Database authentication failed. Please check your database credentials."
        elif "does not exist" in error_msg.lower():
            detail = f"Database '{settings.DB_NAME}' does not exist. Please create it first."
        else:
            detail = f"Database connection error: {error_msg}"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail
        )
    except SQLAlchemyError as e:
        logger.error(f"Database error during login: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database error: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Unexpected error during login: {str(e)}", exc_info=True)
        # Expose the error message in dev mode to make debugging faster.
        if settings.ENV == "dev":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(e)
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred. Please try again later."
        )


@router.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead(id=current_user.id, username=current_user.username, role=current_user.role)


@router.get("/health")
def health_check() -> dict:
    """Health check endpoint to verify database connectivity"""
    from app.db.session import test_connection
    try:
        connection_ok, error_msg = test_connection()
        if connection_ok:
            return {"status": "healthy", "database": "connected"}
        else:
            return {"status": "unhealthy", "database": "disconnected", "error": error_msg}
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}", exc_info=True)
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}


