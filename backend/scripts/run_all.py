#!/usr/bin/env python3
"""
يشغّل Alexa API + Web API.
Start all servers:
  - Alexa API   → port 5002  (/alexa_quiz)
  - Web API     → port 5004  (/api/...)

Le Dashboard 5003 (stats de test) a été retiré — le site web (frontend) sert les interfaces.

Usage: python -m backend.scripts.run_all
  or:  python backend/scripts/run_all.py  (from project root)

Before first run of Phase 4: python -m backend.scripts.migrate_phase4
"""
import os
import sys
import logging
import threading
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

logging.getLogger("werkzeug").setLevel(logging.WARNING)
logger = logging.getLogger("AlexaQuiz")
logger.setLevel(logging.INFO)
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(h)

from backend.config import (
    FLASK_HOST,
    FLASK_PORT,
    QUESTION_CACHE_PATH,
    WEAK_CHUNK_THRESHOLD,
)
from backend.database.connection import init_db
from backend.core.quiz_logic import QuestionCache, SessionStore, QuizSelector
from backend.api.alexa_api import create_alexa_app
from backend.api.web_api import create_web_api
from backend.scripts.run_program_worker import run_worker_loop

WEB_API_PORT = int(os.getenv("WEB_API_PORT", "5004"))


def run_web_api() -> None:
    app = create_web_api()
    logger.info("Web API   → http://%s:%s/api/", FLASK_HOST, WEB_API_PORT)
    app.run(host=FLASK_HOST, port=WEB_API_PORT, use_reloader=False)


def run_alexa(cache: QuestionCache, session_store: SessionStore, selector: QuizSelector) -> None:
    alexa_app = create_alexa_app(cache, session_store, selector)
    logger.info("Alexa API  → http://%s:%s/alexa_quiz", FLASK_HOST, FLASK_PORT)
    alexa_app.run(host=FLASK_HOST, port=FLASK_PORT, use_reloader=False)


if __name__ == "__main__":
    logger.info("Initializing database...")
    init_db()

    shared_cache = QuestionCache(QUESTION_CACHE_PATH)
    shared_cache.load()
    shared_sessions = SessionStore()
    shared_selector = QuizSelector(threshold=WEAK_CHUNK_THRESHOLD)

    threading.Thread(target=run_web_api, daemon=True).start()
    threading.Thread(target=run_worker_loop, daemon=True).start()

    run_alexa(shared_cache, shared_sessions, shared_selector)
