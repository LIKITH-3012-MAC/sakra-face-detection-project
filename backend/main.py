import os
import sys
from pathlib import Path

# Ensure both repository root and backend directory are in sys.path
CURRENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = CURRENT_DIR.parent
for path in (str(CURRENT_DIR), str(REPO_ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)

from backend.config import settings
from backend.security.rate_limiter import limiter
from backend.app import app

__all__ = ["app", "limiter", "settings"]

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port)
