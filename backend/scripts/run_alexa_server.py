#!/usr/bin/env python3
"""
Run Alexa webhook as a standalone cloud service.

This script is intended for hosting platforms (Render/Railway/etc.) where a
single process binds to the external PORT.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv(ROOT / ".env")
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

from backend.config import FLASK_HOST
from backend.database.connection import init_db
from backend.core.quiz_logic import QuestionCache, SessionStore, QuizSelector
from backend.api.alexa_api import create_alexa_app
from backend.config import QUESTION_CACHE_PATH, WEAK_CHUNK_THRESHOLD


def main() -> None:
    port = int(os.getenv("PORT", os.getenv("FLASK_PORT", "5002")))
    init_db()
    cache = QuestionCache(QUESTION_CACHE_PATH)
    cache.load()
    sessions = SessionStore()
    selector = QuizSelector(threshold=WEAK_CHUNK_THRESHOLD)
    app = create_alexa_app(cache, sessions, selector)
    print(f"[startup] Starting Alexa API on {FLASK_HOST}:{port}", flush=True)
    app.run(host=FLASK_HOST, port=port, use_reloader=False)


if __name__ == "__main__":
    main()

