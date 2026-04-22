#!/usr/bin/env python3
"""
Background worker for training program PDF processing.

Runs independently from the Web API so heavy AI generation does not block
user-facing requests.
"""
from __future__ import annotations

import os
import sys
import time
import logging
from pathlib import Path

from sqlalchemy import func

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

from backend.database.connection import get_db, init_db
from backend.database.models import TrainingProgramModel
from backend.api.web_api import _process_training_program

logger = logging.getLogger("AlexaQuiz.ProgramWorker")
POLL_SECONDS = float(os.getenv("PROGRAM_WORKER_POLL_SECONDS", "2.0"))


def _process_next_queued() -> bool:
    with get_db() as db:
        item = (
            db.query(TrainingProgramModel)
            .filter(func.lower(TrainingProgramModel.status) == "queued")
            .order_by(TrainingProgramModel.created_at.asc(), TrainingProgramModel.id.asc())
            .with_for_update(skip_locked=True)
            .first()
        )
        if not item:
            return False
        logger.info("Worker picked program id=%s", item.id)
        _process_training_program(db, item)
        db.commit()
        logger.info("Worker finished program id=%s status=%s", item.id, item.status)
        return True


def run_worker_loop() -> None:
    logger.info("Initializing DB for program worker")
    init_db()
    logger.info("Program worker started (poll=%ss)", POLL_SECONDS)
    while True:
        try:
            worked = _process_next_queued()
            if not worked:
                time.sleep(POLL_SECONDS)
        except Exception:
            logger.exception("Program worker loop error")
            time.sleep(max(2.0, POLL_SECONDS))


if __name__ == "__main__":
    run_worker_loop()

