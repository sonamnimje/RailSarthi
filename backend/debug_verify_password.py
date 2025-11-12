from app.db.session import SessionLocal
from app.db.models import User
from app.api.routes.users import verify_password
import traceback

username = "debug_user@example.com"
password = "debugpass123"

try:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            print("User not found")
        else:
            print("Stored hashed_password:", user.hashed_password)
            try:
                ok = verify_password(password, user.hashed_password)
                print("verify_password returned:", ok)
            except Exception as e:
                print("Exception during verify_password:")
                traceback.print_exc()
    finally:
        db.close()
except Exception:
    traceback.print_exc()
