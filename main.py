import os
import sys
from pathlib import Path

# Ensure repository root is on sys.path so 'backend' is always importable
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Export the FastAPI app, settings, and limiter
from backend.config import settings
from backend.security.rate_limiter import limiter
from backend.app import app

__all__ = ["app", "limiter", "settings"]

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
