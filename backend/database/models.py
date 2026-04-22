"""
SQLAlchemy models.
"""
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import String, Float, Text, ForeignKey, Boolean, Date, Integer, LargeBinary
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    alexa_user_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    patient_id: Mapped[Optional[int]] = mapped_column(ForeignKey("patients.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    last_seen_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class SpecialistModel(Base):
    __tablename__ = "specialists"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Shadow rows: library/patient scope for standalone parents only (not a real clinician login).
    is_shadow: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    preferred_locale: Mapped[str] = mapped_column(String(10), default="ar", nullable=False)
    country: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    state_region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    address_line: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    # Cash billing: admin sets paid_until (last day included); optional per-account grace override.
    subscription_paid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    subscription_grace_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    subscription_billing_exempt: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ParentModel(Base):
    __tablename__ = "parents"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    preferred_locale: Mapped[str] = mapped_column(String(10), default="ar", nullable=False)
    country: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    state_region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    address_line: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
    # linked = under clinician; standalone = self-serve (library/patients use content_specialist_id).
    account_kind: Mapped[str] = mapped_column(String(20), default="linked", nullable=False)
    content_specialist_id: Mapped[Optional[int]] = mapped_column(ForeignKey("specialists.id"), nullable=True, index=True)
    subscription_paid_until: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    subscription_grace_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    subscription_billing_exempt: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AdministratorModel(Base):
    __tablename__ = "administrators"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    preferred_locale: Mapped[str] = mapped_column(String(10), default="ar", nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class PatientModel(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    specialist_id: Mapped[int] = mapped_column(ForeignKey("specialists.id"), nullable=False, index=True)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("parents.id"), nullable=True, index=True)
    assigned_program_id: Mapped[Optional[int]] = mapped_column(ForeignKey("training_programs.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    age: Mapped[Optional[int]] = mapped_column(nullable=True)
    diagnostic: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    alexa_code: Mapped[Optional[str]] = mapped_column(String(32), unique=True, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class TrainingProgramModel(Base):
    __tablename__ = "training_programs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    specialist_id: Mapped[int] = mapped_column(ForeignKey("specialists.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    pdf_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    faiss_index_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    chunks_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    question_count: Mapped[int] = mapped_column(default=0, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class QuestionModel(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    training_program_id: Mapped[Optional[int]] = mapped_column(ForeignKey("training_programs.id"), nullable=True, index=True)
    option_a: Mapped[str] = mapped_column(String(500), nullable=False)
    option_b: Mapped[str] = mapped_column(String(500), nullable=False)
    option_c: Mapped[str] = mapped_column(String(500), nullable=False)
    correct: Mapped[str] = mapped_column(String(1), nullable=False)
    chunk_id: Mapped[int] = mapped_column(nullable=False, index=True)
    chunk_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    times_asked: Mapped[int] = mapped_column(default=0, nullable=False)
    times_correct: Mapped[int] = mapped_column(default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class QuizSessionModel(Base):
    __tablename__ = "quiz_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    patient_id: Mapped[Optional[int]] = mapped_column(ForeignKey("patients.id"), nullable=True, index=True)
    score: Mapped[int] = mapped_column(default=0, nullable=False)
    total_questions: Mapped[int] = mapped_column(default=0, nullable=False)
    accuracy_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    wrong_topics: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("administrators.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[Optional[int]] = mapped_column(nullable=True, index=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))


class StoredFileModel(Base):
    __tablename__ = "stored_files"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    original_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc))
