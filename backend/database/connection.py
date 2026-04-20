"""
Database connection and session management.
"""
import os
import logging
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from backend.database.models import (
    Base,
    UserModel,
    SpecialistModel,
    ParentModel,
    AdministratorModel,
    AuditLogModel,
    PatientModel,
    TrainingProgramModel,
    QuestionModel,
    QuizSessionModel,
)

logger = logging.getLogger("AlexaQuiz.DB")


def get_database_url() -> str:
    return os.getenv(
        "DATABASE_URL",
        "postgresql://quiz_user:quiz_pass@localhost:5432/quiz_db",
    )


engine = create_engine(get_database_url(), echo=False, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE specialists ADD COLUMN IF NOT EXISTS phone VARCHAR(30)",
            "ALTER TABLE specialists ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
            "ALTER TABLE parents ADD COLUMN IF NOT EXISTS phone VARCHAR(30)",
            "ALTER TABLE parents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
            "ALTER TABLE administrators ADD COLUMN IF NOT EXISTS phone VARCHAR(30)",
            "ALTER TABLE administrators ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
            "ALTER TABLE administrators ADD COLUMN IF NOT EXISTS preferred_locale VARCHAR(10) DEFAULT 'ar'",
            "ALTER TABLE specialists ADD COLUMN IF NOT EXISTS preferred_locale VARCHAR(10) DEFAULT 'ar'",
            "ALTER TABLE specialists ADD COLUMN IF NOT EXISTS country VARCHAR(120)",
            "ALTER TABLE specialists ADD COLUMN IF NOT EXISTS state_region VARCHAR(120)",
            "ALTER TABLE specialists ADD COLUMN IF NOT EXISTS address_line TEXT",
            "ALTER TABLE parents ADD COLUMN IF NOT EXISTS preferred_locale VARCHAR(10) DEFAULT 'ar'",
            "ALTER TABLE parents ADD COLUMN IF NOT EXISTS country VARCHAR(120)",
            "ALTER TABLE parents ADD COLUMN IF NOT EXISTS state_region VARCHAR(120)",
            "ALTER TABLE parents ADD COLUMN IF NOT EXISTS address_line TEXT",
            "ALTER TABLE specialists ADD COLUMN IF NOT EXISTS is_shadow BOOLEAN DEFAULT FALSE NOT NULL",
            "ALTER TABLE parents ADD COLUMN IF NOT EXISTS account_kind VARCHAR(20) DEFAULT 'linked' NOT NULL",
            "ALTER TABLE parents ADD COLUMN IF NOT EXISTS content_specialist_id INTEGER REFERENCES specialists(id)",
            "CREATE INDEX IF NOT EXISTS ix_parents_content_specialist_id ON parents(content_specialist_id)",
            "CREATE INDEX IF NOT EXISTS ix_specialists_is_shadow ON specialists(is_shadow)",
            "UPDATE parents SET account_kind = 'linked' WHERE account_kind IS NULL",
            "ALTER TABLE patients ADD COLUMN IF NOT EXISTS assigned_program_id INTEGER",
            "ALTER TABLE training_programs ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'draft'",
            "ALTER TABLE training_programs ADD COLUMN IF NOT EXISTS question_count INTEGER DEFAULT 0",
            "ALTER TABLE training_programs ADD COLUMN IF NOT EXISTS error_message TEXT",
            "ALTER TABLE questions ADD COLUMN IF NOT EXISTS training_program_id INTEGER",
            "CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, admin_id INTEGER NOT NULL, action VARCHAR(100) NOT NULL, target_type VARCHAR(50) NOT NULL, target_id INTEGER NULL, details TEXT NULL, created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW())",
            "ALTER TABLE specialists ADD COLUMN IF NOT EXISTS subscription_paid_until DATE",
            "ALTER TABLE specialists ADD COLUMN IF NOT EXISTS subscription_grace_days INTEGER",
            "ALTER TABLE specialists ADD COLUMN IF NOT EXISTS subscription_billing_exempt BOOLEAN DEFAULT FALSE NOT NULL",
            "ALTER TABLE parents ADD COLUMN IF NOT EXISTS subscription_paid_until DATE",
            "ALTER TABLE parents ADD COLUMN IF NOT EXISTS subscription_grace_days INTEGER",
            "ALTER TABLE parents ADD COLUMN IF NOT EXISTS subscription_billing_exempt BOOLEAN DEFAULT FALSE NOT NULL",
        ]:
            conn.execute(text(stmt))
        conn.commit()
    logger.info("Database tables initialized.")


@contextmanager
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
