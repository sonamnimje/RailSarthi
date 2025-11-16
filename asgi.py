"""Top-level ASGI entry that imports the FastAPI app from the backend package.

This file makes it easy to run uvicorn from the repository root without
needing `--app-dir` or fiddling with PYTHONPATH. Example:

  uvicorn asgi:app --reload

"""
import os
import sys

# Ensure backend is on sys.path so `app` package is importable
ROOT = os.path.dirname(__file__)
BACKEND_PATH = os.path.join(ROOT, "backend")
if BACKEND_PATH not in sys.path:
    sys.path.insert(0, BACKEND_PATH)

from app.main import app  # noqa: E402,F401  (expose ASGI app as `app`)
