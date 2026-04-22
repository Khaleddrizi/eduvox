#!/usr/bin/env python3
"""
Background worker for library PDF processing.

Runs continuously, picks queued training programs, and processes them outside
the web request lifecycle to keep the Web API responsive on cloud hosting.
"""
from __future__ import annotations

import os
import sys
import time
import logging
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

from backend.database.connection import init_db, get_db
from backend.database.models import TrainingProgramModel
from backend.api.web_api import _mark_stale_processing_programs, _process_training_program

logger = logging.getLogger("AlexaQuiz.LibraryWorker")
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(h)
logger.setLevel(logging.INFO)

WORKER_POLL_SECONDS = float(os.getenv("LIBRARY_WORKER_POLL_SECONDS", "2.5"))


def run_once() -> bool:
    """
    Process one queued program if available.
    Returns True when work was performed.
    """
    with get_db() as db:
        _mark_stale_processing_programs(db)
        queued = (
            db.query(TrainingProgramModel)
            .filter(TrainingProgramModel.status == "queued")
            .order_by(TrainingProgramModel.created_at.asc())
            .first()
        )
        if not queued:
            db.commit()
            return False

        logger.info("Worker picked program id=%s", queued.id)
        _process_training_program(db, queued)
        db.commit()
        logger.info(
            "Worker finished program id=%s status=%s questions=%s error=%s",
            queued.id,
            queued.status,
            queued.question_count,
            (queued.error_message or "")[:180],
        )
        return True


def main() -> None:
    init_db()
    logger.info("Library worker started (poll=%ss)", WORKER_POLL_SECONDS)
    while True:
        try:
            worked = run_once()
            if not worked:
                time.sleep(WORKER_POLL_SECONDS)
        except Exception as exc:
            logger.exception("Worker loop error: %s", exc)
            time.sleep(max(2.0, WORKER_POLL_SECONDS))


if __name__ == "__main__":
    main()

