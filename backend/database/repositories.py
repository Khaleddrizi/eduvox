"""
Repository layer: CRUD operations on the database.
"""
import json
import logging
import re
import secrets
from typing import List, Dict, Any, Set

from sqlalchemy.orm import Session
from werkzeug.security import generate_password_hash

from backend.database.models import (
    UserModel,
    QuestionModel,
    QuizSessionModel,
    SpecialistModel,
    ParentModel,
    AdministratorModel,
    PatientModel,
    TrainingProgramModel,
)

logger = logging.getLogger("AlexaQuiz.Repo")


# ========== User Repository ==========

class UserRepository:
    def __init__(self, db: Session):
        self._db = db

    def get_or_create(self, alexa_user_id: str) -> UserModel:
        from datetime import datetime, timezone
        user = (
            self._db.query(UserModel)
            .filter(UserModel.alexa_user_id == alexa_user_id)
            .first()
        )
        if not user:
            user = UserModel(alexa_user_id=alexa_user_id)
            self._db.add(user)
            self._db.flush()
            logger.info("New user created: %s", alexa_user_id)
        else:
            user.last_seen_at = datetime.now(timezone.utc)
        return user

    def get_by_alexa_id(self, alexa_user_id: str) -> UserModel | None:
        return (
            self._db.query(UserModel)
            .filter(UserModel.alexa_user_id == alexa_user_id)
            .first()
        )

    def link_to_patient(self, alexa_user_id: str, patient_id: int) -> bool:
        user = self.get_or_create(alexa_user_id)
        user.patient_id = patient_id
        self._db.flush()
        return True


# ========== Specialist Repository ==========

class SpecialistRepository:
    def __init__(self, db: Session):
        self._db = db

    def create(
        self,
        email: str,
        password_hash: str,
        full_name: str | None = None,
        phone: str | None = None,
        *,
        is_shadow: bool = False,
    ) -> SpecialistModel:
        s = SpecialistModel(
            email=email,
            password_hash=password_hash,
            full_name=full_name,
            phone=phone,
            is_shadow=is_shadow,
        )
        self._db.add(s)
        self._db.flush()
        return s

    def get_by_email(self, email: str) -> SpecialistModel | None:
        return self._db.query(SpecialistModel).filter(SpecialistModel.email == email).first()

    def get_by_id(self, specialist_id: int) -> SpecialistModel | None:
        return self._db.query(SpecialistModel).filter(SpecialistModel.id == specialist_id).first()


# ========== Parent Repository ==========

class ParentRepository:
    def __init__(self, db: Session):
        self._db = db

    def create(
        self,
        email: str,
        password_hash: str,
        full_name: str | None = None,
        phone: str | None = None,
        *,
        account_kind: str = "linked",
        content_specialist_id: int | None = None,
    ) -> ParentModel:
        if account_kind not in ("linked", "standalone"):
            raise ValueError("account_kind must be 'linked' or 'standalone'")
        if account_kind == "linked" and content_specialist_id is not None:
            raise ValueError("linked parents must not set content_specialist_id")
        p = ParentModel(
            email=email,
            password_hash=password_hash,
            full_name=full_name,
            phone=phone,
            account_kind=account_kind,
            content_specialist_id=content_specialist_id,
        )
        self._db.add(p)
        self._db.flush()
        return p

    def get_by_email(self, email: str) -> ParentModel | None:
        return self._db.query(ParentModel).filter(ParentModel.email == email).first()

    def get_by_id(self, parent_id: int) -> ParentModel | None:
        return self._db.query(ParentModel).filter(ParentModel.id == parent_id).first()


# ========== Administrator Repository ==========

class AdministratorRepository:
    def __init__(self, db: Session):
        self._db = db

    def create(
        self,
        email: str,
        password_hash: str,
        full_name: str | None = None,
        phone: str | None = None,
    ) -> AdministratorModel:
        a = AdministratorModel(email=email, password_hash=password_hash, full_name=full_name, phone=phone)
        self._db.add(a)
        self._db.flush()
        return a

    def get_by_email(self, email: str) -> AdministratorModel | None:
        return self._db.query(AdministratorModel).filter(AdministratorModel.email == email).first()

    def get_by_id(self, admin_id: int) -> AdministratorModel | None:
        return self._db.query(AdministratorModel).filter(AdministratorModel.id == admin_id).first()


# ========== Patient Repository ==========

class PatientRepository:
    def __init__(self, db: Session):
        self._db = db

    def create(
        self,
        specialist_id: int,
        name: str,
        age: int | None = None,
        diagnostic: str | None = None,
        parent_id: int | None = None,
        assigned_program_id: int | None = None,
    ) -> PatientModel:
        from backend.core.alexa_codes import generate_alexa_link_code

        code = self._generate_unique_alexa_link_code()
        p = PatientModel(
            specialist_id=specialist_id,
            parent_id=parent_id,
            assigned_program_id=assigned_program_id,
            name=name,
            age=age,
            diagnostic=diagnostic,
            alexa_code=code,
        )
        self._db.add(p)
        self._db.flush()
        return p

    def get_by_id(self, patient_id: int) -> PatientModel | None:
        return self._db.query(PatientModel).filter(PatientModel.id == patient_id).first()

    def get_by_specialist(self, specialist_id: int) -> List[Dict[str, Any]]:
        patients = (
            self._db.query(PatientModel)
            .filter(PatientModel.specialist_id == specialist_id)
            .order_by(PatientModel.name)
            .all()
        )
        return [self._to_dict(p) for p in patients]

    def get_by_parent(self, parent_id: int) -> List[Dict[str, Any]]:
        patients = (
            self._db.query(PatientModel)
            .filter(PatientModel.parent_id == parent_id)
            .order_by(PatientModel.name)
            .all()
        )
        return [self._to_dict(p) for p in patients]

    def _generate_unique_alexa_link_code(self, max_attempts: int = 40) -> str:
        from backend.core.alexa_codes import generate_alexa_link_code

        for _ in range(max_attempts):
            candidate = generate_alexa_link_code()
            exists = (
                self._db.query(PatientModel)
                .filter(PatientModel.alexa_code == candidate)
                .first()
            )
            if not exists:
                return candidate
        raise RuntimeError("Unable to generate a unique Alexa link code")

    def get_by_alexa_code(self, code: str) -> PatientModel | None:
        from backend.core.alexa_codes import normalize_alexa_link_code

        normalized = normalize_alexa_link_code(code)
        if not normalized:
            return None
        lookup = normalized.upper() if re.search(r"[A-F]", normalized, re.IGNORECASE) else normalized
        return (
            self._db.query(PatientModel)
            .filter(PatientModel.alexa_code == lookup)
            .first()
        )

    def assign_program(self, patient_id: int, program_id: int | None) -> PatientModel | None:
        patient = self.get_by_id(patient_id)
        if not patient:
            return None
        patient.assigned_program_id = program_id
        self._db.flush()
        return patient

    def _to_dict(self, p: PatientModel) -> Dict[str, Any]:
        return {
            "id": p.id,
            "specialist_id": p.specialist_id,
            "parent_id": p.parent_id,
            "assigned_program_id": p.assigned_program_id,
            "name": p.name,
            "age": p.age,
            "diagnostic": p.diagnostic,
            "alexa_code": p.alexa_code,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }


# ========== Training Program Repository ==========

class TrainingProgramRepository:
    def __init__(self, db: Session):
        self._db = db

    def create(
        self,
        specialist_id: int,
        name: str,
        pdf_path: str | None = None,
        faiss_index_path: str | None = None,
        chunks_path: str | None = None,
        status: str = "draft",
    ) -> TrainingProgramModel:
        program = TrainingProgramModel(
            specialist_id=specialist_id,
            name=name,
            pdf_path=pdf_path,
            faiss_index_path=faiss_index_path,
            chunks_path=chunks_path,
            status=status,
        )
        self._db.add(program)
        self._db.flush()
        return program

    def get_by_id(self, program_id: int) -> TrainingProgramModel | None:
        return self._db.query(TrainingProgramModel).filter(TrainingProgramModel.id == program_id).first()

    def get_by_specialist(self, specialist_id: int) -> List[Dict[str, Any]]:
        programs = (
            self._db.query(TrainingProgramModel)
            .filter(TrainingProgramModel.specialist_id == specialist_id)
            .order_by(TrainingProgramModel.created_at.desc())
            .all()
        )
        return [self._to_dict(p) for p in programs]

    def delete(self, program_id: int) -> bool:
        program = self.get_by_id(program_id)
        if not program:
            return False
        self._db.delete(program)
        self._db.flush()
        return True

    def _to_dict(self, p: TrainingProgramModel) -> Dict[str, Any]:
        return {
            "id": p.id,
            "specialist_id": p.specialist_id,
            "name": p.name,
            "pdf_path": p.pdf_path,
            "faiss_index_path": p.faiss_index_path,
            "chunks_path": p.chunks_path,
            "status": p.status,
            "question_count": p.question_count,
            "error_message": p.error_message,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }


# ========== Question Repository ==========

class QuestionRepository:
    def __init__(self, db: Session):
        self._db = db

    def get_all(self) -> List[Dict[str, Any]]:
        questions = self._db.query(QuestionModel).all()
        return [self._to_dict(q) for q in questions]

    def get_by_chunk_id(self, chunk_id: int) -> List[Dict[str, Any]]:
        questions = (
            self._db.query(QuestionModel)
            .filter(QuestionModel.chunk_id == chunk_id)
            .all()
        )
        return [self._to_dict(q) for q in questions]

    def get_by_training_program_id(self, training_program_id: int) -> List[Dict[str, Any]]:
        questions = (
            self._db.query(QuestionModel)
            .filter(QuestionModel.training_program_id == training_program_id)
            .all()
        )
        return [self._to_dict(q) for q in questions]

    def update_stats(self, question_dict: Dict[str, Any], user_answer: str) -> None:
        q = self._db.query(QuestionModel).filter(
            QuestionModel.id == question_dict.get("db_id")
        ).first()
        if not q:
            return
        q.times_asked = (q.times_asked or 0) + 1
        if (user_answer or "").strip().upper() == (q.correct or "").strip().upper():
            q.times_correct = (q.times_correct or 0) + 1

    def import_from_cache(self, questions: List[Dict[str, Any]]) -> int:
        imported = 0
        for q in questions:
            opts = q.get("options", {})
            existing = (
                self._db.query(QuestionModel)
                .filter(QuestionModel.chunk_id == q.get("chunk_id", -1))
                .filter(QuestionModel.question == q.get("question", ""))
                .first()
            )
            if existing:
                q["db_id"] = existing.id
                continue
            model = QuestionModel(
                question=q.get("question", ""),
                training_program_id=q.get("training_program_id"),
                option_a=opts.get("A", ""),
                option_b=opts.get("B", ""),
                option_c=opts.get("C", ""),
                correct=q.get("correct", "A"),
                chunk_id=q.get("chunk_id", 0),
                chunk_text=q.get("chunk_text", ""),
                times_asked=q.get("times_asked", 0),
                times_correct=q.get("times_correct", 0),
            )
            self._db.add(model)
            self._db.flush()
            q["db_id"] = model.id
            imported += 1
        logger.info("Imported %d questions to DB.", imported)
        return imported

    def _to_dict(self, q: QuestionModel) -> Dict[str, Any]:
        return {
            "db_id": q.id,
            "question": q.question,
            "training_program_id": q.training_program_id,
            "options": {"A": q.option_a, "B": q.option_b, "C": q.option_c},
            "correct": q.correct,
            "chunk_id": q.chunk_id,
            "chunk_text": q.chunk_text or "",
            "times_asked": q.times_asked or 0,
            "times_correct": q.times_correct or 0,
        }


# ========== Session Repository ==========

class SessionRepository:
    def __init__(self, db: Session):
        self._db = db

    def save_session(
        self,
        user_id: int,
        score: int,
        total: int,
        wrong_topics: List[str],
        patient_id: int | None = None,
    ) -> QuizSessionModel:
        pct = round((score / max(1, total)) * 100, 1)
        session = QuizSessionModel(
            user_id=user_id,
            patient_id=patient_id,
            score=score,
            total_questions=total,
            accuracy_pct=pct,
            wrong_topics=json.dumps(wrong_topics, ensure_ascii=False),
        )
        self._db.add(session)
        self._db.flush()
        logger.info("Session saved: user=%s score=%s/%s (%.1f%%)", user_id, score, total, pct)
        return session

    def get_user_sessions(self, user_id: int, limit: int = 10) -> List[Dict[str, Any]]:
        sessions = (
            self._db.query(QuizSessionModel)
            .filter(QuizSessionModel.user_id == user_id)
            .order_by(QuizSessionModel.created_at.desc())
            .limit(limit)
            .all()
        )
        return [self._to_dict(s) for s in sessions]

    def get_patient_sessions(self, patient_id: int, limit: int = 20) -> List[Dict[str, Any]]:
        sessions = (
            self._db.query(QuizSessionModel)
            .filter(QuizSessionModel.patient_id == patient_id)
            .order_by(QuizSessionModel.created_at.desc())
            .limit(limit)
            .all()
        )
        return [self._to_dict(s) for s in sessions]

    def get_patient_stats(self, patient_id: int) -> Dict[str, Any]:
        from sqlalchemy import func
        row = (
            self._db.query(
                func.count(QuizSessionModel.id).label("total_sessions"),
                func.sum(QuizSessionModel.score).label("total_correct"),
                func.sum(QuizSessionModel.total_questions).label("total_asked"),
                func.avg(QuizSessionModel.accuracy_pct).label("avg_accuracy"),
            )
            .filter(QuizSessionModel.patient_id == patient_id)
            .first()
        )
        if row is None:
            return {"total_sessions": 0, "total_correct": 0, "total_asked": 0, "avg_accuracy": 0.0}
        return {
            "total_sessions": row.total_sessions or 0,
            "total_correct": row.total_correct or 0,
            "total_asked": row.total_asked or 0,
            "avg_accuracy": round(row.avg_accuracy or 0, 1),
        }

    def get_global_stats(self) -> Dict[str, Any]:
        from sqlalchemy import func
        row = self._db.query(
            func.count(QuizSessionModel.id).label("total_sessions"),
            func.sum(QuizSessionModel.score).label("total_correct"),
            func.sum(QuizSessionModel.total_questions).label("total_asked"),
            func.avg(QuizSessionModel.accuracy_pct).label("avg_accuracy"),
        ).first()
        if row is None:
            return {"total_sessions": 0, "total_correct": 0, "total_asked": 0, "avg_accuracy": 0.0}
        return {
            "total_sessions": row.total_sessions or 0,
            "total_correct": row.total_correct or 0,
            "total_asked": row.total_asked or 0,
            "avg_accuracy": round(row.avg_accuracy or 0, 1),
        }

    def _to_dict(self, s: QuizSessionModel) -> Dict[str, Any]:
        wrong = []
        try:
            wrong = json.loads(s.wrong_topics or "[]")
        except (json.JSONDecodeError, TypeError):
            pass
        return {
            "id": s.id,
            "user_id": s.user_id,
            "patient_id": s.patient_id,
            "score": s.score,
            "total_questions": s.total_questions,
            "accuracy_pct": s.accuracy_pct,
            "wrong_topics": wrong,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }


def create_standalone_parent_with_shadow(
    db: Session,
    email: str,
    password_hash: str,
    full_name: str | None = None,
    phone: str | None = None,
) -> ParentModel:
    """
    Self-serve parent: account_kind standalone + internal specialist row for library/patient scope.
    Caller must commit the session. Login remains role=parent (not the shadow specialist).
    """
    parent_repo = ParentRepository(db)
    spec_repo = SpecialistRepository(db)

    parent = parent_repo.create(
        email,
        password_hash,
        full_name,
        phone,
        account_kind="standalone",
        content_specialist_id=None,
    )
    db.flush()

    shadow_email = f"shadow-p{parent.id}@internal.local"
    if spec_repo.get_by_email(shadow_email):
        shadow_email = f"shadow-p{parent.id}-{secrets.token_hex(4)}@internal.local"

    shadow = spec_repo.create(
        shadow_email,
        generate_password_hash(secrets.token_urlsafe(32)),
        full_name=None,
        phone=None,
        is_shadow=True,
    )
    db.flush()
    parent.content_specialist_id = shadow.id
    db.flush()
    return parent
