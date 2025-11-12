# Debug helper to create a test user and print exceptions
import traceback
from app.db.session import SessionLocal
from app.db.models import User
from app.api.routes.users import hash_password

username = "debug_user@example.com"
password = "debugpass123"

try:
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            print("User already exists, will print id:", existing.id)
        else:
            user = User(username=username, hashed_password=hash_password(password), role='controller')
            db.add(user)
            db.commit()
            db.refresh(user)
            print("Created user id:", user.id)
    except Exception as e:
        print("Exception while creating user:")
        traceback.print_exc()
    finally:
        db.close()
except Exception as e:
    print("Failed to create DB session:")
    traceback.print_exc()
