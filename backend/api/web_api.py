# pyright: reportMissingImports=false
import logging
import secrets
import re
import json
import random
import os
import mimetypes
import threading
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timezone, timedelta

import bcrypt
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from backend.database.connection import get_db, init_db
from backend.core.subscription_access import subscription_state_for_parent_row, subscription_state_for_specialist_row
from backend.config import DATA_DIR, QUESTION_CACHE_PATH, CHUNK_SIZE, CHUNK_OVERLAP, GROQ_API_KEY
from backend.database.models import QuizSessionModel, PatientModel, ParentModel, SpecialistModel, AdministratorModel, UserModel, QuestionModel, AuditLogModel, TrainingProgramModel
from backend.database.repositories import (
    SpecialistRepository,
    ParentRepository,
    AdministratorRepository,
    PatientRepository,
    SessionRepository,
    TrainingProgramRepository,
    QuestionRepository,
    create_standalone_parent_with_shadow,
)

logger = logging.getLogger("AlexaQuiz.WebAPI")
AUTH_TOKEN_MAX_AGE_SECONDS = int(os.getenv("AUTH_TOKEN_MAX_AGE_SECONDS", str(14 * 24 * 3600)))
AUTH_TOKEN_SECRET = os.getenv("WEB_API_AUTH_SECRET", "adhd-assist-dev-secret-change-in-prod")
_token_serializer = URLSafeTimedSerializer(AUTH_TOKEN_SECRET, salt="web-api-auth")
PROCESSING_STALE_MINUTES = int(os.getenv("PROGRAM_PROCESSING_STALE_MINUTES", "20"))

AVATAR_DIR = DATA_DIR / "avatars"
AVATAR_EXT_ALLOWED = {".jpg", ".jpeg", ".png", ".webp"}
AVATAR_MAX_BYTES = 2 * 1024 * 1024


def _ensure_avatar_dir() -> None:
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)


def _avatar_disk_paths(prefix: str, user_id: int) -> list[Path]:
    _ensure_avatar_dir()
    return sorted(AVATAR_DIR.glob(f"{prefix}_{user_id}.*"))


def _delete_user_avatars(prefix: str, user_id: int) -> None:
    for p in _avatar_disk_paths(prefix, user_id):
        try:
            p.unlink(missing_ok=True)
        except TypeError:
            try:
                if p.exists():
                    p.unlink()
            except OSError:
                pass
        except OSError:
            pass


def _delete_specialist_cascade(db, specialist_id: int) -> None:
    """Delete specialist-owned data: sessions, Alexa users, patients, programs, questions; then the account."""
    patient_ids = [p.id for p in db.query(PatientModel).filter(PatientModel.specialist_id == specialist_id).all()]
    if patient_ids:
        db.query(QuizSessionModel).filter(QuizSessionModel.patient_id.in_(patient_ids)).delete(synchronize_session=False)
        uids = [u.id for u in db.query(UserModel).filter(UserModel.patient_id.in_(patient_ids)).all()]
        if uids:
            db.query(QuizSessionModel).filter(QuizSessionModel.user_id.in_(uids)).delete(synchronize_session=False)
            db.query(UserModel).filter(UserModel.id.in_(uids)).delete(synchronize_session=False)
    db.query(PatientModel).filter(PatientModel.specialist_id == specialist_id).update(
        {"assigned_program_id": None},
        synchronize_session=False,
    )
    prog_ids = [pr.id for pr in db.query(TrainingProgramModel).filter(TrainingProgramModel.specialist_id == specialist_id).all()]
    if prog_ids:
        db.query(QuestionModel).filter(QuestionModel.training_program_id.in_(prog_ids)).delete(synchronize_session=False)
        db.query(TrainingProgramModel).filter(TrainingProgramModel.id.in_(prog_ids)).delete(synchronize_session=False)
    db.query(PatientModel).filter(PatientModel.specialist_id == specialist_id).delete(synchronize_session=False)
    _delete_user_avatars("specialist", specialist_id)
    spec = db.query(SpecialistModel).filter(SpecialistModel.id == specialist_id).first()
    if spec:
        db.delete(spec)


def _verify_password(stored_hash: str, password: str) -> bool:
    ok = check_password_hash(stored_hash, password)
    if ok:
        return True
    if (stored_hash or "").startswith("$2"):
        try:
            return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
        except Exception:
            return False
    return False


def _specialist_subscription_dict(s: SpecialistModel) -> dict:
    return subscription_state_for_specialist_row(
        bool(getattr(s, "is_shadow", False)),
        getattr(s, "subscription_paid_until", None),
        getattr(s, "subscription_grace_days", None),
        bool(getattr(s, "subscription_billing_exempt", False)),
    )


def _parent_subscription_dict(p: ParentModel) -> dict:
    return subscription_state_for_parent_row(
        getattr(p, "account_kind", None) or "linked",
        getattr(p, "subscription_paid_until", None),
        getattr(p, "subscription_grace_days", None),
        bool(getattr(p, "subscription_billing_exempt", False)),
    )


def _subscription_error_response(state: dict, code: str = "subscription_blocked"):
    return jsonify({"error": code, "subscription": state}), 403


def _specialist_payload(s: SpecialistModel) -> dict:
    return {
        "id": s.id,
        "email": s.email,
        "full_name": s.full_name,
        "phone": s.phone,
        "is_active": bool(getattr(s, "is_active", True)),
        "preferred_locale": getattr(s, "preferred_locale", None) or "ar",
        "country": getattr(s, "country", None),
        "state_region": getattr(s, "state_region", None),
        "address_line": getattr(s, "address_line", None),
        "role": "specialist",
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "subscription_paid_until": s.subscription_paid_until.isoformat()
        if getattr(s, "subscription_paid_until", None)
        else None,
        "subscription_grace_days": getattr(s, "subscription_grace_days", None),
        "subscription_billing_exempt": bool(getattr(s, "subscription_billing_exempt", False)),
        "subscription": _specialist_subscription_dict(s),
    }


def _parent_payload(p: ParentModel) -> dict:
    return {
        "id": p.id,
        "email": p.email,
        "full_name": p.full_name,
        "phone": p.phone,
        "is_active": bool(getattr(p, "is_active", True)),
        "preferred_locale": getattr(p, "preferred_locale", None) or "ar",
        "country": getattr(p, "country", None),
        "state_region": getattr(p, "state_region", None),
        "address_line": getattr(p, "address_line", None),
        "role": "parent",
        "account_kind": getattr(p, "account_kind", None) or "linked",
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "subscription_paid_until": p.subscription_paid_until.isoformat()
        if getattr(p, "subscription_paid_until", None)
        else None,
        "subscription_grace_days": getattr(p, "subscription_grace_days", None),
        "subscription_billing_exempt": bool(getattr(p, "subscription_billing_exempt", False)),
        "subscription": _parent_subscription_dict(p),
    }


def _program_payload(program) -> dict:
    return {
        "id": program.id,
        "name": program.name,
        "status": program.status,
        "question_count": program.question_count,
        "pdf_path": program.pdf_path,
    }


def _admin_payload(a: AdministratorModel) -> dict:
    return {
        "id": a.id,
        "email": a.email,
        "full_name": a.full_name,
        "phone": a.phone,
        "is_active": bool(getattr(a, "is_active", True)),
        "preferred_locale": getattr(a, "preferred_locale", None) or "ar",
        "role": "administration",
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _build_auth_token(user_id: int, role: str) -> str:
    return _token_serializer.dumps({"id": user_id, "role": role})


def _payload_with_auth(payload: dict, user_id: int, role: str) -> dict:
    account_type = "therapist" if role == "specialist" else "administration" if role == "administration" else "parent"
    return {
        **payload,
        "auth_token": _build_auth_token(user_id, role),
        "accountType": account_type,
    }


def _attach_parent_info(db, patient_dict: dict) -> dict:
    parent_id = patient_dict.get("parent_id")
    if not parent_id:
        patient_dict["parent"] = None
        return patient_dict
    parent = ParentRepository(db).get_by_id(parent_id)
    patient_dict["parent"] = _parent_payload(parent) if parent else None
    return patient_dict


def _attach_program_info(db, patient_dict: dict) -> dict:
    program_id = patient_dict.get("assigned_program_id")
    if not program_id:
        patient_dict["assigned_program"] = None
        return patient_dict
    program = TrainingProgramRepository(db).get_by_id(program_id)
    patient_dict["assigned_program"] = _program_payload(program) if program else None
    return patient_dict


def _process_training_program(db, item) -> None:
    # Lazy imports to keep API startup fast on low-memory hosts.
    from backend.core.pdf_utils import extract_text_from_pdf, chunk_text
    from backend.core.quiz_logic import QuizGenerator, QuestionCache

    item.status = "processing"
    item.error_message = None
    item.question_count = 0
    db.flush()

    if not item.pdf_path:
        item.status = "draft"
        item.error_message = "No PDF file linked"
        db.flush()
        return
    if re.match(r"^https?://", item.pdf_path, re.IGNORECASE):
        item.status = "draft"
        item.error_message = "Automatic processing is available for uploaded or local PDF files only"
        db.flush()
        return
    if not GROQ_API_KEY:
        item.status = "failed"
        item.error_message = "GROQ_API_KEY is not configured"
        db.flush()
        return

    try:
        text = extract_text_from_pdf(item.pdf_path)
        chunks = chunk_text(text, chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)
        chunks = [c for c in chunks if c.strip()]
        if not chunks:
            raise ValueError("No readable text chunks found in the PDF")

        max_questions = min(10, len(chunks))
        generator = QuizGenerator(api_key=GROQ_API_KEY)
        used = set()
        generated = []
        attempt = 0
        max_attempts = max_questions * 4

        while len(generated) < max_questions and attempt < max_attempts:
            attempt += 1
            idx = random.randint(0, len(chunks) - 1)
            if idx in used:
                continue
            used.add(idx)
            result = generator.generate(chunks[idx])
            if not result:
                continue
            unique_chunk_id = (item.id * 1_000_000) + idx
            generated.append({
                "question": result["question"],
                "training_program_id": item.id,
                "options": result.get("options", {"A": "A) ?", "B": "B) ?", "C": "C) ?"}),
                "correct": result.get("correct", "A"),
                "chunk_id": unique_chunk_id,
                "chunk_text": chunks[idx][:500],
                "times_asked": 0,
                "times_correct": 0,
            })

        if not generated:
            raise ValueError("Question generation failed for this PDF")

        # Re-processing should replace this program's previous questions.
        db.query(QuestionModel).filter(QuestionModel.training_program_id == item.id).delete(
            synchronize_session=False
        )
        imported = QuestionRepository(db).import_from_cache(generated)
        cache = QuestionCache(QUESTION_CACHE_PATH)
        existing = cache.load() if QUESTION_CACHE_PATH.exists() else []
        preserved = [q for q in existing if q.get("training_program_id") != item.id]
        merged = preserved + generated
        QUESTION_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(QUESTION_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(merged, f, indent=2, ensure_ascii=False)

        item.question_count = imported or len(generated)
        item.status = "ready"
        item.error_message = None
        db.flush()
    except Exception as exc:
        item.status = "failed"
        item.error_message = str(exc)[:500]
        item.question_count = 0
        db.flush()


def _process_training_program_async(item_id: int) -> None:
    try:
        with get_db() as db:
            repo = TrainingProgramRepository(db)
            item = repo.get_by_id(item_id)
            if not item:
                return
            _process_training_program(db, item)
            db.commit()
    except Exception as exc:
        try:
            with get_db() as db2:
                repo2 = TrainingProgramRepository(db2)
                item2 = repo2.get_by_id(item_id)
                if item2 and item2.status == "processing":
                    item2.status = "failed"
                    item2.error_message = "Background processing crashed. Please retry processing."
                    db2.commit()
        except Exception:
            pass
        logger.exception("Async processing failed for program %s: %s", item_id, exc)


def _mark_stale_processing_programs(db, specialist_id: int | None = None) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=PROCESSING_STALE_MINUTES)
    q = db.query(TrainingProgramModel).filter(TrainingProgramModel.status == "processing")
    if specialist_id is not None:
        q = q.filter(TrainingProgramModel.specialist_id == specialist_id)
    stale_items = q.filter(TrainingProgramModel.created_at < cutoff).all()
    if not stale_items:
        return
    for item in stale_items:
        item.status = "failed"
        item.error_message = "Processing timed out or was interrupted. Please click Retry Processing."
        item.question_count = 0
    db.flush()


def _parent_account_kind(parent: ParentModel) -> str:
    return (getattr(parent, "account_kind", None) or "linked").strip().lower()


def _parent_standalone_library_sid(parent: ParentModel) -> int | None:
    if _parent_account_kind(parent) != "standalone":
        return None
    sid = getattr(parent, "content_specialist_id", None)
    return int(sid) if isinstance(sid, int) else None


def _resolve_specialist_id_for_new_parent_child(db: Session, parent: ParentModel) -> tuple[int | None, str | None]:
    """Returns (specialist_id, error_message)."""
    if _parent_account_kind(parent) == "standalone":
        sid = getattr(parent, "content_specialist_id", None)
        if not sid:
            return None, "Account is not ready for adding children. Please contact support."
        return int(sid), None
    first = (
        db.query(PatientModel)
        .filter(PatientModel.parent_id == parent.id)
        .order_by(PatientModel.id.asc())
        .first()
    )
    if not first:
        return None, "Your clinician must add your first child before you can add more children from here."
    return int(first.specialist_id), None


def create_web_api() -> Flask:
    app = Flask(__name__)
    # Render runs this module directly (run.py with PORT); ensure schema patches run
    # so ORM columns (e.g. specialists/parents preferred_locale) exist before login queries.
    try:
        init_db()
    except Exception:
        logger.exception("init_db() failed during Web API startup")
        raise

    default_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]
    extra_origins = [o.strip() for o in (os.getenv("WEB_CORS_ORIGINS", "")).split(",") if o.strip()]
    CORS(app, origins=default_origins + extra_origins, supports_credentials=True)

    def _decode_auth_identity() -> dict | None:
        auth_header = (request.headers.get("Authorization") or "").strip()
        if not auth_header.lower().startswith("bearer "):
            return None
        token = auth_header[7:].strip()
        if not token:
            return None
        try:
            data = _token_serializer.loads(token, max_age=AUTH_TOKEN_MAX_AGE_SECONDS)
        except (BadSignature, SignatureExpired):
            return None
        if not isinstance(data, dict):
            return None
        user_id = data.get("id")
        role = data.get("role")
        if not isinstance(user_id, int) or role not in ("specialist", "parent", "administration"):
            return None
        return {"id": user_id, "role": role}

    @app.route("/api/auth/register", methods=["POST"])
    def register():
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        role = (data.get("role") or "specialist").lower()
        full_name = (data.get("full_name") or "").strip() or None
        phone = (data.get("phone") or "").strip() or None
        if not email or not password:
            return jsonify({"error": "email and password required"}), 400

        with get_db() as db:
            if role == "specialist":
                repo = SpecialistRepository(db)
                if repo.get_by_email(email):
                    return jsonify({"error": "email already registered"}), 409
                s = repo.create(email, generate_password_hash(password), full_name, phone=phone)
                db.commit()
                return jsonify(_payload_with_auth(_specialist_payload(s), s.id, "specialist")), 201
            elif role == "parent":
                kind = (data.get("account_kind") or "").strip().lower()
                if kind != "standalone":
                    return jsonify(
                        {
                            "error": "Parent self-registration requires account_kind=standalone. "
                            "Clinician-linked parent accounts are created by the specialist."
                        }
                    ), 403
                if len(password) < 6:
                    return jsonify({"error": "password must be at least 6 characters"}), 400
                parent_repo = ParentRepository(db)
                if parent_repo.get_by_email(email):
                    return jsonify({"error": "email already registered"}), 409
                spec_repo = SpecialistRepository(db)
                if spec_repo.get_by_email(email):
                    return jsonify({"error": "email already registered"}), 409
                admin_repo = AdministratorRepository(db)
                if admin_repo.get_by_email(email):
                    return jsonify({"error": "email already registered"}), 409
                p = create_standalone_parent_with_shadow(
                    db,
                    email,
                    generate_password_hash(password),
                    full_name,
                    phone=phone,
                )
                db.commit()
                return jsonify(_payload_with_auth(_parent_payload(p), p.id, "parent")), 201
            elif role == "administration":
                repo = AdministratorRepository(db)
                if repo.get_by_email(email):
                    return jsonify({"error": "email already registered"}), 409
                a = repo.create(email, generate_password_hash(password), full_name, phone=phone)
                db.commit()
                return jsonify(_payload_with_auth(_admin_payload(a), a.id, "administration")), 201
            return jsonify({"error": "invalid role"}), 400

    @app.route("/api/auth/login", methods=["POST"])
    def login():
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        role = (data.get("role") or "specialist").lower()
        if not email or not password:
            return jsonify({"error": "email and password required"}), 400

        with get_db() as db:
            if role == "specialist":
                repo = SpecialistRepository(db)
                s = repo.get_by_email(email)
                if not s or not _verify_password(s.password_hash, password):
                    return jsonify({"error": "invalid credentials"}), 401
                if not getattr(s, "is_active", True):
                    return jsonify({"error": "Account disabled. Contact administration."}), 403
                return jsonify(_payload_with_auth(_specialist_payload(s), s.id, "specialist"))
            elif role == "parent":
                repo = ParentRepository(db)
                p = repo.get_by_email(email)
                if not p:
                    return jsonify({"error": "invalid credentials"}), 401
                if not _verify_password(p.password_hash, password):
                    return jsonify({"error": "invalid credentials"}), 401
                if not getattr(p, "is_active", True):
                    return jsonify({"error": "Account disabled. Contact administration."}), 403
                return jsonify(_payload_with_auth(_parent_payload(p), p.id, "parent"))
            elif role == "administration":
                repo = AdministratorRepository(db)
                a = repo.get_by_email(email)
                if not a or not _verify_password(a.password_hash, password):
                    return jsonify({"error": "invalid credentials"}), 401
                if not getattr(a, "is_active", True):
                    return jsonify({"error": "Account disabled. Contact administration."}), 403
                return jsonify(_payload_with_auth(_admin_payload(a), a.id, "administration"))
            return jsonify({"error": "invalid role"}), 400

    def _get_specialist_id() -> int | None:
        identity = _decode_auth_identity()
        if identity and identity.get("role") == "specialist":
            return identity.get("id")
        return None

    def _auth_required():
        return jsonify({"error": "Authorization token required. Please login again."}), 401

    def _get_admin_id() -> int | None:
        identity = _decode_auth_identity()
        if identity and identity.get("role") == "administration":
            return identity.get("id")
        return None

    def _audit_log(db, admin_id: int, action: str, target_type: str, target_id: int | None = None, details: dict | None = None):
        db.add(
            AuditLogModel(
                admin_id=admin_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                details=json.dumps(details or {}, ensure_ascii=False),
            )
        )

    @app.route("/api/administration/me", methods=["GET"])
    def get_admin_me():
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        with get_db() as db:
            admin = AdministratorRepository(db).get_by_id(aid)
            if not admin:
                return jsonify({"error": "administrator not found"}), 404
            return jsonify(_admin_payload(admin))

    @app.route("/api/administration/me", methods=["PUT"])
    def update_admin_me():
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        data = request.get_json() or {}
        if "preferred_locale" not in data:
            return jsonify({"error": "preferred_locale required"}), 400
        loc = (data.get("preferred_locale") or "ar").strip().lower()
        if loc not in ("ar", "fr", "en"):
            return jsonify({"error": "preferred_locale must be ar, fr, or en"}), 400
        with get_db() as db:
            admin = AdministratorRepository(db).get_by_id(aid)
            if not admin:
                return jsonify({"error": "administrator not found"}), 404
            admin.preferred_locale = loc
            db.commit()
            db.refresh(admin)
            return jsonify(_admin_payload(admin))

    @app.route("/api/administration/overview", methods=["GET"])
    def get_admin_overview():
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        with get_db() as db:
            now = datetime.now(timezone.utc)
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            total_parents = db.query(ParentModel).count()
            standalone_parents = db.query(ParentModel).filter(ParentModel.account_kind == "standalone").count()
            linked_parents = db.query(ParentModel).filter(
                or_(ParentModel.account_kind == "linked", ParentModel.account_kind.is_(None))
            ).count()
            payload = {
                "total_doctors": db.query(SpecialistModel).filter(SpecialistModel.is_shadow.is_(False)).count(),
                "total_parents": total_parents,
                "standalone_parents_count": standalone_parents,
                "linked_parents_count": linked_parents,
                "total_children": db.query(PatientModel).count(),
                "total_alexa_users": db.query(UserModel).count(),
                "sessions_today": db.query(QuizSessionModel).filter(QuizSessionModel.created_at >= today_start).count(),
                "orphan_children": db.query(PatientModel).filter(PatientModel.parent_id.is_(None)).count(),
            }
            return jsonify(payload)

    @app.route("/api/administration/doctors", methods=["GET"])
    def list_admin_doctors():
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        q = (request.args.get("q") or "").strip().lower()
        with get_db() as db:
            query = db.query(SpecialistModel).filter(SpecialistModel.is_shadow.is_(False))
            if q:
                query = query.filter(
                    or_(
                        func.lower(SpecialistModel.email).like(f"%{q}%"),
                        func.lower(SpecialistModel.full_name).like(f"%{q}%"),
                    )
                )
            doctors = query.order_by(SpecialistModel.created_at.desc()).all()
            return jsonify([
                {
                    "id": d.id,
                    "email": d.email,
                    "full_name": d.full_name,
                    "phone": d.phone,
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                    "patients_count": db.query(PatientModel).filter(PatientModel.specialist_id == d.id).count(),
                    "is_active": bool(getattr(d, "is_active", True)),
                    "subscription_paid_until": d.subscription_paid_until.isoformat()
                    if getattr(d, "subscription_paid_until", None)
                    else None,
                    "subscription_grace_days": getattr(d, "subscription_grace_days", None),
                    "subscription_billing_exempt": bool(getattr(d, "subscription_billing_exempt", False)),
                    "subscription": _specialist_subscription_dict(d),
                }
                for d in doctors
            ])

    @app.route("/api/administration/parents", methods=["GET"])
    def list_admin_parents():
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        q = (request.args.get("q") or "").strip().lower()
        kind = (request.args.get("account_kind") or "").strip().lower()
        with get_db() as db:
            query = db.query(ParentModel)
            if kind in ("standalone", "linked"):
                query = query.filter(ParentModel.account_kind == kind)
            if q:
                query = query.filter(
                    or_(
                        func.lower(ParentModel.email).like(f"%{q}%"),
                        func.lower(ParentModel.full_name).like(f"%{q}%"),
                    )
                )
            parents = query.order_by(ParentModel.created_at.desc()).all()
            return jsonify([
                {
                    "id": p.id,
                    "email": p.email,
                    "full_name": p.full_name,
                    "phone": p.phone,
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                    "children_count": db.query(PatientModel).filter(PatientModel.parent_id == p.id).count(),
                    "is_active": bool(getattr(p, "is_active", True)),
                    "account_kind": getattr(p, "account_kind", None) or "linked",
                    "subscription_paid_until": p.subscription_paid_until.isoformat()
                    if getattr(p, "subscription_paid_until", None)
                    else None,
                    "subscription_grace_days": getattr(p, "subscription_grace_days", None),
                    "subscription_billing_exempt": bool(getattr(p, "subscription_billing_exempt", False)),
                    "subscription": _parent_subscription_dict(p),
                }
                for p in parents
            ])

    @app.route("/api/administration/children", methods=["GET"])
    def list_admin_children():
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        q = (request.args.get("q") or "").strip().lower()
        with get_db() as db:
            query = db.query(PatientModel)
            if q:
                query = query.filter(func.lower(PatientModel.name).like(f"%{q}%"))
            children = query.order_by(PatientModel.created_at.desc()).all()
            output = []
            for c in children:
                parent = ParentRepository(db).get_by_id(c.parent_id) if c.parent_id else None
                doctor = SpecialistRepository(db).get_by_id(c.specialist_id) if c.specialist_id else None
                stats = SessionRepository(db).get_patient_stats(c.id)
                output.append({
                    "id": c.id,
                    "name": c.name,
                    "age": c.age,
                    "diagnostic": c.diagnostic,
                    "alexa_code": c.alexa_code,
                    "parent_id": c.parent_id,
                    "specialist_id": c.specialist_id,
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                    "doctor_name": doctor.full_name or doctor.email if doctor else "—",
                    "parent_name": parent.full_name or parent.email if parent else "—",
                    "parent_email": parent.email if parent else None,
                    "sessions_count": stats.get("total_sessions", 0),
                    "avg_accuracy": stats.get("avg_accuracy", 0),
                })
            return jsonify(output)

    @app.route("/api/administration/doctors/<int:doctor_id>/status", methods=["PUT"])
    def admin_set_doctor_status(doctor_id: int):
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        enabled = bool((request.get_json() or {}).get("is_active", True))
        with get_db() as db:
            doctor = SpecialistRepository(db).get_by_id(doctor_id)
            if not doctor:
                return jsonify({"error": "doctor not found"}), 404
            doctor.is_active = enabled
            _audit_log(db, aid, "doctor_status_update", "doctor", doctor_id, {"is_active": enabled})
            db.commit()
            return jsonify({"message": "Doctor status updated", "id": doctor_id, "is_active": enabled})

    @app.route("/api/administration/doctors/<int:doctor_id>/reset-password", methods=["POST"])
    def admin_reset_doctor_password(doctor_id: int):
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        with get_db() as db:
            doctor = SpecialistRepository(db).get_by_id(doctor_id)
            if not doctor:
                return jsonify({"error": "doctor not found"}), 404
            temp_password = secrets.token_urlsafe(10)
            doctor.password_hash = generate_password_hash(temp_password)
            _audit_log(db, aid, "doctor_password_reset", "doctor", doctor_id, {})
            db.commit()
            return jsonify({"message": "Temporary password generated", "temporary_password": temp_password})

    @app.route("/api/administration/parents/<int:parent_id>/status", methods=["PUT"])
    def admin_set_parent_status(parent_id: int):
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        enabled = bool((request.get_json() or {}).get("is_active", True))
        with get_db() as db:
            parent = ParentRepository(db).get_by_id(parent_id)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            parent.is_active = enabled
            _audit_log(db, aid, "parent_status_update", "parent", parent_id, {"is_active": enabled})
            db.commit()
            return jsonify({"message": "Parent status updated", "id": parent_id, "is_active": enabled})

    @app.route("/api/administration/parents/<int:parent_id>/reset-password", methods=["POST"])
    def admin_reset_parent_password(parent_id: int):
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        with get_db() as db:
            parent = ParentRepository(db).get_by_id(parent_id)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            temp_password = secrets.token_urlsafe(10)
            parent.password_hash = generate_password_hash(temp_password)
            _audit_log(db, aid, "parent_password_reset", "parent", parent_id, {})
            db.commit()
            return jsonify({"message": "Temporary password generated", "temporary_password": temp_password})

    @app.route("/api/administration/doctors/<int:doctor_id>/subscription", methods=["PUT"])
    def admin_set_doctor_subscription(doctor_id: int):
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        data = request.get_json() or {}
        with get_db() as db:
            doctor = SpecialistRepository(db).get_by_id(doctor_id)
            if not doctor or bool(getattr(doctor, "is_shadow", False)):
                return jsonify({"error": "doctor not found"}), 404
            if "billing_exempt" in data:
                doctor.subscription_billing_exempt = bool(data.get("billing_exempt"))
            if "grace_days" in data:
                g = data.get("grace_days")
                if g in (None, ""):
                    doctor.subscription_grace_days = None
                else:
                    try:
                        doctor.subscription_grace_days = max(0, int(g))
                    except (TypeError, ValueError):
                        return jsonify({"error": "grace_days must be integer or null"}), 400
            if "paid_until" in data:
                pu = data.get("paid_until")
                if pu in (None, ""):
                    doctor.subscription_paid_until = None
                else:
                    try:
                        doctor.subscription_paid_until = datetime.strptime(str(pu).strip()[:10], "%Y-%m-%d").date()
                    except ValueError:
                        return jsonify({"error": "paid_until must be YYYY-MM-DD or null"}), 400
            _audit_log(
                db,
                aid,
                "doctor_subscription_update",
                "doctor",
                doctor_id,
                {k: data.get(k) for k in ("paid_until", "grace_days", "billing_exempt") if k in data},
            )
            db.commit()
            db.refresh(doctor)
            return jsonify(
                {
                    "id": doctor.id,
                    "subscription_paid_until": doctor.subscription_paid_until.isoformat()
                    if doctor.subscription_paid_until
                    else None,
                    "subscription_grace_days": doctor.subscription_grace_days,
                    "subscription_billing_exempt": doctor.subscription_billing_exempt,
                    "subscription": _specialist_subscription_dict(doctor),
                }
            )

    @app.route("/api/administration/parents/<int:parent_id>/subscription", methods=["PUT"])
    def admin_set_parent_subscription(parent_id: int):
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        data = request.get_json() or {}
        with get_db() as db:
            parent = ParentRepository(db).get_by_id(parent_id)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            if "billing_exempt" in data:
                parent.subscription_billing_exempt = bool(data.get("billing_exempt"))
            if "grace_days" in data:
                g = data.get("grace_days")
                if g in (None, ""):
                    parent.subscription_grace_days = None
                else:
                    try:
                        parent.subscription_grace_days = max(0, int(g))
                    except (TypeError, ValueError):
                        return jsonify({"error": "grace_days must be integer or null"}), 400
            if "paid_until" in data:
                pu = data.get("paid_until")
                if pu in (None, ""):
                    parent.subscription_paid_until = None
                else:
                    try:
                        parent.subscription_paid_until = datetime.strptime(str(pu).strip()[:10], "%Y-%m-%d").date()
                    except ValueError:
                        return jsonify({"error": "paid_until must be YYYY-MM-DD or null"}), 400
            _audit_log(
                db,
                aid,
                "parent_subscription_update",
                "parent",
                parent_id,
                {k: data.get(k) for k in ("paid_until", "grace_days", "billing_exempt") if k in data},
            )
            db.commit()
            db.refresh(parent)
            return jsonify(
                {
                    "id": parent.id,
                    "subscription_paid_until": parent.subscription_paid_until.isoformat()
                    if parent.subscription_paid_until
                    else None,
                    "subscription_grace_days": parent.subscription_grace_days,
                    "subscription_billing_exempt": parent.subscription_billing_exempt,
                    "subscription": _parent_subscription_dict(parent),
                }
            )

    @app.route("/api/administration/children/<int:child_id>/transfer", methods=["PUT"])
    def admin_transfer_child(child_id: int):
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        data = request.get_json() or {}
        new_parent_id = data.get("parent_id")
        new_specialist_id = data.get("specialist_id")
        with get_db() as db:
            child = PatientRepository(db).get_by_id(child_id)
            if not child:
                return jsonify({"error": "child not found"}), 404
            if new_parent_id is not None:
                parent = ParentRepository(db).get_by_id(int(new_parent_id))
                if not parent:
                    return jsonify({"error": "parent not found"}), 404
                child.parent_id = int(new_parent_id)
            if new_specialist_id is not None:
                doctor = SpecialistRepository(db).get_by_id(int(new_specialist_id))
                if not doctor:
                    return jsonify({"error": "doctor not found"}), 404
                child.specialist_id = int(new_specialist_id)
            _audit_log(
                db,
                aid,
                "child_transfer",
                "child",
                child_id,
                {"parent_id": child.parent_id, "specialist_id": child.specialist_id},
            )
            db.commit()
            return jsonify({"message": "Child ownership updated", "id": child_id, "parent_id": child.parent_id, "specialist_id": child.specialist_id})

    @app.route("/api/administration/audit-logs", methods=["GET"])
    def admin_audit_logs():
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        limit = min(max(request.args.get("limit", default=50, type=int), 1), 200)
        action = (request.args.get("action") or "").strip()
        target_type = (request.args.get("target_type") or "").strip()
        q = (request.args.get("q") or "").strip().lower()
        with get_db() as db:
            query = db.query(AuditLogModel)
            if action:
                query = query.filter(AuditLogModel.action == action)
            if target_type:
                query = query.filter(AuditLogModel.target_type == target_type)
            if q:
                query = query.filter(func.lower(AuditLogModel.details).like(f"%{q}%"))
            logs = query.order_by(AuditLogModel.created_at.desc()).limit(limit).all()
            return jsonify([
                {
                    "id": l.id,
                    "admin_id": l.admin_id,
                    "action": l.action,
                    "target_type": l.target_type,
                    "target_id": l.target_id,
                    "details": json.loads(l.details or "{}"),
                    "created_at": l.created_at.isoformat() if l.created_at else None,
                }
                for l in logs
            ])

    @app.route("/api/administration/incidents", methods=["GET"])
    def admin_incidents():
        aid = _get_admin_id()
        if not aid:
            return _auth_required()
        with get_db() as db:
            disabled_doctors = db.query(SpecialistModel).filter(SpecialistModel.is_active == False).order_by(SpecialistModel.created_at.desc()).all()  # noqa: E712
            disabled_parents = db.query(ParentModel).filter(ParentModel.is_active == False).order_by(ParentModel.created_at.desc()).all()  # noqa: E712
            orphan_children = db.query(PatientModel).filter(PatientModel.parent_id.is_(None)).order_by(PatientModel.created_at.desc()).all()

            return jsonify({
                "disabled_doctors": [
                    {
                        "id": d.id,
                        "email": d.email,
                        "full_name": d.full_name,
                        "created_at": d.created_at.isoformat() if d.created_at else None,
                    }
                    for d in disabled_doctors
                ],
                "disabled_parents": [
                    {
                        "id": p.id,
                        "email": p.email,
                        "full_name": p.full_name,
                        "created_at": p.created_at.isoformat() if p.created_at else None,
                    }
                    for p in disabled_parents
                ],
                "orphan_children": [
                    {
                        "id": c.id,
                        "name": c.name,
                        "age": c.age,
                        "diagnostic": c.diagnostic,
                        "created_at": c.created_at.isoformat() if c.created_at else None,
                    }
                    for c in orphan_children
                ],
            })

    @app.route("/api/specialists/me", methods=["GET"])
    def get_specialist_me():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        with get_db() as db:
            specialist = SpecialistRepository(db).get_by_id(sid)
            if not specialist:
                return jsonify({"error": "specialist not found"}), 404
            return jsonify(_specialist_payload(specialist))

    @app.route("/api/specialists/me", methods=["PUT"])
    def update_specialist_me():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        data = request.get_json() or {}
        with get_db() as db:
            repo = SpecialistRepository(db)
            specialist = repo.get_by_id(sid)
            if not specialist:
                return jsonify({"error": "specialist not found"}), 404
            if "email" in data:
                email = (data.get("email") or "").strip().lower()
                if not email:
                    return jsonify({"error": "email required"}), 400
                if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
                    return jsonify({"error": "Invalid email format"}), 400
                existing = repo.get_by_email(email)
                if existing and existing.id != sid:
                    return jsonify({"error": "email already registered"}), 409
                specialist.email = email
            if "full_name" in data:
                specialist.full_name = (data.get("full_name") or "").strip() or None
            if "phone" in data:
                specialist.phone = (data.get("phone") or "").strip() or None
            if "preferred_locale" in data:
                loc = (data.get("preferred_locale") or "ar").strip().lower()
                if loc not in ("ar", "fr", "en"):
                    return jsonify({"error": "preferred_locale must be ar, fr, or en"}), 400
                specialist.preferred_locale = loc
            if "country" in data:
                specialist.country = (data.get("country") or "").strip() or None
            if "state_region" in data:
                specialist.state_region = (data.get("state_region") or "").strip() or None
            if "address_line" in data:
                specialist.address_line = (data.get("address_line") or "").strip() or None
            db.commit()
            db.refresh(specialist)
            return jsonify(_specialist_payload(specialist))

    @app.route("/api/specialists/change-password", methods=["PUT"])
    def change_specialist_password():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        data = request.get_json() or {}
        current_password = data.get("current_password") or ""
        new_password = data.get("new_password") or ""
        if not current_password or not new_password:
            return jsonify({"error": "current_password and new_password required"}), 400
        if len(new_password) < 8:
            return jsonify({"error": "New password must be at least 8 characters"}), 400
        with get_db() as db:
            repo = SpecialistRepository(db)
            specialist = repo.get_by_id(sid)
            if not specialist:
                return jsonify({"error": "specialist not found"}), 404
            if not _verify_password(specialist.password_hash, current_password):
                return jsonify({"error": "Current password is incorrect"}), 401
            specialist.password_hash = generate_password_hash(new_password)
            db.commit()
            return jsonify({"message": "Password updated successfully"})

    @app.route("/api/specialists/me/avatar", methods=["GET", "POST", "DELETE"])
    def specialist_avatar():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        if request.method == "GET":
            paths = _avatar_disk_paths("specialist", sid)
            if not paths:
                return "", 404
            p = paths[0]
            mt = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
            return send_file(p, mimetype=mt, max_age=0)
        if request.method == "DELETE":
            _delete_user_avatars("specialist", sid)
            return jsonify({"message": "Avatar removed"})
        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"error": "file required"}), 400
        ext = Path(secure_filename(file.filename)).suffix.lower()
        if ext not in AVATAR_EXT_ALLOWED:
            return jsonify({"error": "invalid image type"}), 400
        raw = file.read()
        if len(raw) > AVATAR_MAX_BYTES:
            return jsonify({"error": "file too large"}), 400
        _delete_user_avatars("specialist", sid)
        _ensure_avatar_dir()
        dest = AVATAR_DIR / f"specialist_{sid}{ext}"
        dest.write_bytes(raw)
        return jsonify({"message": "Avatar updated"})

    @app.route("/api/specialists/me", methods=["DELETE"])
    def delete_specialist_me():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        data = request.get_json() or {}
        current_password = data.get("current_password") or ""
        if not current_password:
            return jsonify({"error": "current_password required"}), 400
        with get_db() as db:
            specialist = SpecialistRepository(db).get_by_id(sid)
            if not specialist:
                return jsonify({"error": "specialist not found"}), 404
            if not _verify_password(specialist.password_hash, current_password):
                return jsonify({"error": "Current password is incorrect"}), 401
            _delete_specialist_cascade(db, sid)
            db.commit()
            return jsonify({"message": "Account deleted"})

    @app.route("/api/doctor/dashboard-summary", methods=["GET"])
    def doctor_dashboard_summary():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        with get_db() as db:
            p_repo = PatientRepository(db)
            s_repo = SessionRepository(db)
            patients = p_repo.get_by_specialist(sid)
            for p in patients:
                stats = s_repo.get_patient_stats(p["id"])
                p["stats"] = stats
                p["last_session"] = (s_repo.get_patient_sessions(p["id"], limit=1)[0] if stats["total_sessions"] else None)
                _attach_parent_info(db, p)
            return jsonify(patients)

    @app.route("/api/specialists/patients", methods=["GET"])
    def list_specialist_patients():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        with get_db() as db:
            p_repo = PatientRepository(db)
            s_repo = SessionRepository(db)
            patients = p_repo.get_by_specialist(sid)
            for p in patients:
                stats = s_repo.get_patient_stats(p["id"])
                p["stats"] = stats
                p["last_session"] = (s_repo.get_patient_sessions(p["id"], limit=1)[0] if stats["total_sessions"] else None)
                _attach_parent_info(db, p)
            return jsonify(patients)

    @app.route("/api/specialists/patients", methods=["POST"])
    def create_patient():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        data = request.get_json() or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name required"}), 400
        age = data.get("age")
        diagnostic = (data.get("diagnostic") or "").strip() or None
        parent_email = (data.get("parent_email") or "").strip().lower() or None
        parent_id = None
        if parent_email:
            with get_db() as db:
                parent_repo = ParentRepository(db)
                parent = parent_repo.get_by_email(parent_email)
                parent_id = parent.id if parent else None

        with get_db() as db:
            p_repo = PatientRepository(db)
            spec_repo = SpecialistRepository(db)
            if not spec_repo.get_by_id(sid):
                return jsonify({"error": "specialist not found"}), 404
            p = p_repo.create(sid, name, age=age, diagnostic=diagnostic, parent_id=parent_id)
            db.commit()
            return jsonify(p_repo._to_dict(p)), 201

    @app.route("/api/doctor/add-patient", methods=["POST"])
    def add_patient_doctor():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        data = request.get_json() or {}
        child = data.get("child") or {}
        parent_data = data.get("parent") or {}
        assigned_program_id = child.get("assigned_program_id")
        name = (child.get("name") or "").strip()
        age = child.get("age")
        adhd_level = (child.get("adhd_level") or "").strip() or None
        parent_name = (parent_data.get("name") or "").strip() or None
        parent_email = (parent_data.get("email") or "").strip().lower()
        parent_phone = (parent_data.get("phone") or "").strip() or None
        if not name:
            return jsonify({"error": "Child name is required"}), 400
        if not parent_email:
            return jsonify({"error": "Parent email is required"}), 400
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", parent_email):
            return jsonify({"error": "Invalid email format"}), 400
        with get_db() as db:
            spec_repo = SpecialistRepository(db)
            if not spec_repo.get_by_id(sid):
                return jsonify({"error": "specialist not found"}), 404
            spec = spec_repo.get_by_email(parent_email)
            if spec:
                return jsonify({"error": "This email is already registered as a therapist"}), 409
            admin = AdministratorRepository(db).get_by_email(parent_email)
            if admin:
                return jsonify({"error": "This email is already registered as an administrator"}), 409
            parent_repo = ParentRepository(db)
            parent = parent_repo.get_by_email(parent_email)
            temp_password = None
            parent_created = False
            if not parent:
                temp_password = secrets.token_urlsafe(12)
                password_hash = generate_password_hash(temp_password)
                parent = parent_repo.create(
                    parent_email,
                    password_hash,
                    parent_name,
                    phone=parent_phone,
                    account_kind="linked",
                )
                db.flush()
                parent_created = True
            elif parent_name and not parent.full_name:
                parent.full_name = parent_name
            elif parent_phone and not parent.phone:
                parent.phone = parent_phone
            parent_id = parent.id
            p_repo = PatientRepository(db)
            program_repo = TrainingProgramRepository(db)
            diagnostic = adhd_level if adhd_level in ("Mild", "Moderate", "Severe") else adhd_level
            resolved_program_id = None
            if assigned_program_id not in (None, ""):
                try:
                    resolved_program_id = int(assigned_program_id)
                except (TypeError, ValueError):
                    return jsonify({"error": "assigned_program_id must be a valid integer"}), 400
                program = program_repo.get_by_id(resolved_program_id)
                if not program or program.specialist_id != sid:
                    return jsonify({"error": "Selected training program was not found"}), 404
                if program.status != "ready":
                    return jsonify({"error": "Only ready training programs can be assigned"}), 400
                spec_row = SpecialistRepository(db).get_by_id(sid)
                sub = _specialist_subscription_dict(spec_row) if spec_row else subscription_state_for_specialist_row(False, None, None, True)
                if sub.get("new_program_assign_blocked"):
                    return _subscription_error_response(sub, "subscription_assign_blocked")
            p = p_repo.create(
                sid,
                name,
                age=age,
                diagnostic=diagnostic,
                parent_id=parent_id,
                assigned_program_id=resolved_program_id,
            )
            db.commit()
            family_children = [
                child for child in p_repo.get_by_parent(parent_id)
                if child.get("specialist_id") == sid
            ]
            payload = {
                "id": p.id,
                "message": "Patient added successfully",
                "patient": p_repo._to_dict(p),
                "parent_created": parent_created,
                "family_children_count": len(family_children),
            }
            if temp_password:
                payload["parent_temp_password"] = temp_password
            return jsonify(payload), 201

    @app.route("/api/doctor/parent-lookup", methods=["GET"])
    def doctor_parent_lookup():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        email = (request.args.get("email") or "").strip().lower()
        if not email:
            return jsonify({"exists": False, "parent": None, "children": []})
        with get_db() as db:
            if SpecialistRepository(db).get_by_email(email):
                return jsonify({
                    "exists": False,
                    "conflict_role": "specialist",
                    "parent": None,
                    "children": [],
                })
            parent = ParentRepository(db).get_by_email(email)
            if not parent:
                return jsonify({"exists": False, "parent": None, "children": []})
            children = [
                child for child in PatientRepository(db).get_by_parent(parent.id)
                if child.get("specialist_id") == sid
            ]
            return jsonify({
                "exists": True,
                "parent": _parent_payload(parent),
                "children": [
                    {
                        "id": child["id"],
                        "name": child["name"],
                        "age": child.get("age"),
                        "diagnostic": child.get("diagnostic"),
                        "alexa_code": child.get("alexa_code"),
                    }
                    for child in children
                ],
            })

    @app.route("/api/specialists/patients/<int:patient_id>", methods=["GET"])
    def get_patient(patient_id: int):
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        with get_db() as db:
            p_repo = PatientRepository(db)
            p = p_repo.get_by_id(patient_id)
            if not p or p.specialist_id != sid:
                return jsonify({"error": "patient not found"}), 404
            s_repo = SessionRepository(db)
            d = p_repo._to_dict(p)
            d["stats"] = s_repo.get_patient_stats(patient_id)
            d["last_session"] = (s_repo.get_patient_sessions(patient_id, limit=1)[0] if d["stats"]["total_sessions"] else None)
            _attach_parent_info(db, d)
            _attach_program_info(db, d)
            return jsonify(d)

    @app.route("/api/specialists/patients/<int:patient_id>/assign-program", methods=["PUT"])
    def assign_patient_program(patient_id: int):
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        data = request.get_json() or {}
        training_program_id = data.get("training_program_id")
        with get_db() as db:
            p_repo = PatientRepository(db)
            program_repo = TrainingProgramRepository(db)
            patient = p_repo.get_by_id(patient_id)
            if not patient or patient.specialist_id != sid:
                return jsonify({"error": "patient not found"}), 404
            if training_program_id in ("", None):
                p_repo.assign_program(patient_id, None)
                db.commit()
                payload = p_repo._to_dict(patient)
                _attach_parent_info(db, payload)
                _attach_program_info(db, payload)
                return jsonify(payload)

            try:
                training_program_id = int(training_program_id)
            except (TypeError, ValueError):
                return jsonify({"error": "training_program_id must be a valid integer"}), 400

            program = program_repo.get_by_id(training_program_id)
            if not program or program.specialist_id != sid:
                return jsonify({"error": "training program not found"}), 404
            if program.status != "ready":
                return jsonify({"error": "Only ready training programs can be assigned"}), 400

            spec_row = SpecialistRepository(db).get_by_id(sid)
            sub = _specialist_subscription_dict(spec_row) if spec_row else subscription_state_for_specialist_row(False, None, None, True)
            if sub.get("new_program_assign_blocked"):
                return _subscription_error_response(sub, "subscription_assign_blocked")

            p_repo.assign_program(patient_id, training_program_id)
            db.commit()
            payload = p_repo._to_dict(patient)
            _attach_parent_info(db, payload)
            _attach_program_info(db, payload)
            return jsonify(payload)

    @app.route("/api/specialists/dashboard", methods=["GET"])
    def get_specialist_dashboard():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        period = (request.args.get("period") or "7d").strip().lower()
        weeks_back = 1
        if period == "30d":
            weeks_back = 4
        elif period in ("3m", "3mo", "3months"):
            weeks_back = 12
        with get_db() as db:
            p_repo = PatientRepository(db)
            s_repo = SessionRepository(db)
            patients = p_repo.get_by_specialist(sid)
            patient_ids = [p["id"] for p in patients]

            if not patient_ids:
                return jsonify({
                    "total_patients": 0,
                    "quiz_today": 0,
                    "quiz_yesterday": 0,
                    "avg_progression": 0,
                    "assiduity_avg": 0,
                    "progression_by_week": [],
                    "diagnostic_distribution": [],
                    "recent_activities": [],
                    "sessions_by_day": [],
                })

            now = datetime.now(timezone.utc)
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            yesterday_start = today_start - timedelta(days=1)

            quiz_today = db.query(QuizSessionModel).filter(
                QuizSessionModel.patient_id.in_(patient_ids),
                QuizSessionModel.created_at >= today_start,
            ).count()
            quiz_yesterday = db.query(QuizSessionModel).filter(
                QuizSessionModel.patient_id.in_(patient_ids),
                QuizSessionModel.created_at >= yesterday_start,
                QuizSessionModel.created_at < today_start,
            ).count()

            total_prog = 0
            total_assiduity = 0
            patient_names = {p["id"]: p["name"] for p in patients}
            diagnostic_data: dict[str, list[float]] = defaultdict(list)
            for p in patients:
                stats = s_repo.get_patient_stats(p["id"])
                acc = stats.get("avg_accuracy", 0)
                total_prog += acc
                total_assiduity += min(100, stats.get("total_sessions", 0) * 10)
                diag = (p.get("diagnostic") or "-").strip() or "Non spécifié"
                diagnostic_data[diag].append(acc)

            avg_progression = round(total_prog / len(patients), 1) if patients else 0
            assiduity_avg = round(total_assiduity / len(patients), 0) if patients else 0

            progression_by_week = []
            for i in range(weeks_back - 1, -1, -1):
                week_end = today_start - timedelta(weeks=i)
                week_start = week_end - timedelta(days=7)
                row = db.query(func.avg(QuizSessionModel.accuracy_pct)).filter(
                    QuizSessionModel.patient_id.in_(patient_ids),
                    QuizSessionModel.created_at >= week_start,
                    QuizSessionModel.created_at < week_end,
                ).scalar()
                prog = round(row or 0, 1)
                progression_by_week.append({
                    "semaine": f"W-{weeks_back-i}",
                    "progression": prog,
                    "objectif": 70,
                })

            diagnostic_distribution = []
            diagnostic_by_group = []
            colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"]
            for i, (name, accs) in enumerate(diagnostic_data.items()):
                count = len(accs)
                pct = round((count / len(patients)) * 100) if patients else 0
                avg_prog = round(sum(accs) / count, 1) if accs else 0
                diagnostic_distribution.append({
                    "name": name,
                    "value": pct,
                    "count": count,
                    "color": colors[i % len(colors)],
                })
                diagnostic_by_group.append({
                    "groupe": name,
                    "enfants": count,
                    "progression": avg_prog,
                })

            recent_sessions = (
                db.query(QuizSessionModel)
                .filter(QuizSessionModel.patient_id.in_(patient_ids))
                .order_by(QuizSessionModel.created_at.desc())
                .limit(10)
                .all()
            )
            recent_activities = []
            for s in recent_sessions:
                name = patient_names.get(s.patient_id or 0, "Patient")
                dt = s.created_at
                if dt:
                    fmt = "Aujourd'hui, %H:%M" if dt.date() == now.date() else "Hier, %H:%M" if dt.date() == (now - timedelta(days=1)).date() else "%d/%m, %H:%M"
                    time_str = dt.strftime(fmt)
                else:
                    time_str = "-"
                recent_activities.append({
                    "id": s.id,
                    "message": f"{name} a terminé un quiz ({s.score}/{s.total_questions}).",
                    "time": time_str,
                    "accuracy": s.accuracy_pct,
                })

            # Sessions this week (Mon-Sun)
            week_start = today_start - timedelta(days=6)
            recent_week_sessions = db.query(QuizSessionModel.created_at).filter(
                QuizSessionModel.patient_id.in_(patient_ids),
                QuizSessionModel.created_at >= week_start,
                QuizSessionModel.created_at < (today_start + timedelta(days=1)),
            ).all()
            day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            counts_by_day = {i: 0 for i in range(7)}  # 0=Mon
            for (dt,) in recent_week_sessions:
                if not dt:
                    continue
                try:
                    weekday = dt.weekday()
                except Exception:
                    continue
                if 0 <= weekday <= 6:
                    counts_by_day[weekday] += 1
            sessions_by_day = [{"day": day_labels[i], "count": counts_by_day[i]} for i in range(7)]

            return jsonify({
                "total_patients": len(patients),
                "patients_added_this_month": sum(1 for p in patients if (p.get("created_at") or "").startswith(now.strftime("%Y-%m"))),
                "quiz_today": quiz_today,
                "quiz_yesterday": quiz_yesterday,
                "avg_progression": avg_progression,
                "assiduity_avg": int(assiduity_avg),
                "progression_by_week": progression_by_week,
                "diagnostic_distribution": diagnostic_distribution,
                "diagnostic_by_group": diagnostic_by_group,
                "recent_activities": recent_activities,
                "sessions_by_day": sessions_by_day,
            })

    @app.route("/api/specialists/patients/<int:patient_id>/sessions", methods=["GET"])
    def get_patient_sessions(patient_id: int):
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        limit = request.args.get("limit", default=20, type=int)
        with get_db() as db:
            p_repo = PatientRepository(db)
            p = p_repo.get_by_id(patient_id)
            if not p or p.specialist_id != sid:
                return jsonify({"error": "patient not found"}), 404
            return jsonify(SessionRepository(db).get_patient_sessions(patient_id, limit=limit))

    @app.route("/api/specialists/library", methods=["GET"])
    def list_specialist_library():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        with get_db() as db:
            _mark_stale_processing_programs(db, specialist_id=sid)
            db.commit()
            repo = TrainingProgramRepository(db)
            return jsonify(repo.get_by_specialist(sid))

    @app.route("/api/specialists/library", methods=["POST"])
    def create_specialist_library_item():
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        if request.content_type and "multipart/form-data" in request.content_type:
            name = (request.form.get("name") or "").strip()
            pdf_path = (request.form.get("pdf_path") or "").strip() or None
            uploaded_file = request.files.get("pdf_file")
        else:
            data = request.get_json() or {}
            name = (data.get("name") or "").strip()
            pdf_path = (data.get("pdf_path") or "").strip() or None
            uploaded_file = None
        if not name:
            return jsonify({"error": "name required"}), 400
        if uploaded_file and uploaded_file.filename:
            uploads_dir = DATA_DIR / "library_uploads"
            uploads_dir.mkdir(parents=True, exist_ok=True)
            safe_name = secure_filename(uploaded_file.filename) or f"resource-{secrets.token_hex(4)}.pdf"
            unique_name = f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(4)}-{safe_name}"
            saved_path = uploads_dir / unique_name
            uploaded_file.save(saved_path)
            pdf_path = str(saved_path)
        with get_db() as db:
            spec_row = SpecialistRepository(db).get_by_id(sid)
            if not spec_row:
                return jsonify({"error": "specialist not found"}), 404
            sub = _specialist_subscription_dict(spec_row)
            if sub.get("library_frozen"):
                return _subscription_error_response(sub, "subscription_library_frozen")
            repo = TrainingProgramRepository(db)
            initial_status = "processing" if pdf_path else "draft"
            item = repo.create(sid, name=name, pdf_path=pdf_path, status=initial_status)
            db.commit()
            if pdf_path:
                threading.Thread(
                    target=_process_training_program_async,
                    args=(item.id,),
                    daemon=True,
                ).start()
            return jsonify(repo._to_dict(item)), 201

    @app.route("/api/specialists/library/<int:item_id>/process", methods=["POST"])
    def process_specialist_library_item(item_id: int):
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        with get_db() as db:
            spec_row = SpecialistRepository(db).get_by_id(sid)
            sub = _specialist_subscription_dict(spec_row) if spec_row else subscription_state_for_specialist_row(False, None, None, True)
            if sub.get("library_frozen"):
                return _subscription_error_response(sub, "subscription_library_frozen")
            repo = TrainingProgramRepository(db)
            item = repo.get_by_id(item_id)
            if not item or item.specialist_id != sid:
                return jsonify({"error": "library item not found"}), 404
            if not item.pdf_path:
                return jsonify({"error": "No PDF linked to this library item"}), 400
            item.status = "processing"
            item.error_message = None
            db.commit()
            threading.Thread(
                target=_process_training_program_async,
                args=(item.id,),
                daemon=True,
            ).start()
            return jsonify(repo._to_dict(item)), 200

    @app.route("/api/specialists/library/<int:item_id>", methods=["DELETE"])
    def delete_specialist_library_item(item_id: int):
        sid = _get_specialist_id()
        if not sid:
            return _auth_required()
        with get_db() as db:
            spec_row = SpecialistRepository(db).get_by_id(sid)
            sub = _specialist_subscription_dict(spec_row) if spec_row else subscription_state_for_specialist_row(False, None, None, True)
            if sub.get("library_frozen"):
                return _subscription_error_response(sub, "subscription_library_frozen")
            repo = TrainingProgramRepository(db)
            item = repo.get_by_id(item_id)
            if not item or item.specialist_id != sid:
                return jsonify({"error": "library item not found"}), 404
            pdf_path = item.pdf_path
            db.query(PatientModel).filter(PatientModel.assigned_program_id == item_id).update(
                {"assigned_program_id": None},
                synchronize_session=False,
            )
            db.query(QuestionModel).filter(QuestionModel.training_program_id == item_id).delete(
                synchronize_session=False
            )
            repo.delete(item_id)
            db.commit()
            if pdf_path:
                try:
                    path = Path(pdf_path)
                    uploads_dir = DATA_DIR / "library_uploads"
                    if path.exists() and uploads_dir in path.parents:
                        path.unlink()
                except Exception:
                    pass
            return jsonify({"message": "Library item deleted successfully"})

    def _get_parent_id() -> int | None:
        identity = _decode_auth_identity()
        if identity and identity.get("role") == "parent":
            return identity.get("id")
        return None

    @app.route("/api/parents/me", methods=["GET"])
    def get_parent_me():
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        with get_db() as db:
            parent = ParentRepository(db).get_by_id(pid)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            return jsonify(_parent_payload(parent))

    @app.route("/api/parents/me", methods=["PUT"])
    def update_parent_me():
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        data = request.get_json() or {}
        with get_db() as db:
            repo = ParentRepository(db)
            parent = repo.get_by_id(pid)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            if "email" in data:
                email = (data.get("email") or "").strip().lower()
                if not email:
                    return jsonify({"error": "email required"}), 400
                if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email):
                    return jsonify({"error": "Invalid email format"}), 400
                existing = repo.get_by_email(email)
                if existing and existing.id != pid:
                    return jsonify({"error": "email already registered"}), 409
                parent.email = email
            if "full_name" in data:
                parent.full_name = (data.get("full_name") or "").strip() or None
            if "phone" in data:
                parent.phone = (data.get("phone") or "").strip() or None
            if "preferred_locale" in data:
                loc = (data.get("preferred_locale") or "ar").strip().lower()
                if loc not in ("ar", "fr", "en"):
                    return jsonify({"error": "preferred_locale must be ar, fr, or en"}), 400
                parent.preferred_locale = loc
            if "country" in data:
                parent.country = (data.get("country") or "").strip() or None
            if "state_region" in data:
                parent.state_region = (data.get("state_region") or "").strip() or None
            if "address_line" in data:
                parent.address_line = (data.get("address_line") or "").strip() or None
            db.commit()
            db.refresh(parent)
            return jsonify(_parent_payload(parent))

    @app.route("/api/parents/change-password", methods=["PUT"])
    def change_parent_password():
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        data = request.get_json() or {}
        current_password = data.get("current_password") or ""
        new_password = data.get("new_password") or ""
        if not current_password or not new_password:
            return jsonify({"error": "current_password and new_password required"}), 400
        if len(new_password) < 8:
            return jsonify({"error": "New password must be at least 8 characters"}), 400
        with get_db() as db:
            repo = ParentRepository(db)
            parent = repo.get_by_id(pid)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            if not _verify_password(parent.password_hash, current_password):
                return jsonify({"error": "Current password is incorrect"}), 401
            parent.password_hash = generate_password_hash(new_password)
            db.commit()
            return jsonify({"message": "Password updated successfully"})

    @app.route("/api/parents/me/avatar", methods=["GET", "POST", "DELETE"])
    def parent_avatar():
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        if request.method == "GET":
            paths = _avatar_disk_paths("parent", pid)
            if not paths:
                return "", 404
            p = paths[0]
            mt = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
            return send_file(p, mimetype=mt, max_age=0)
        if request.method == "DELETE":
            _delete_user_avatars("parent", pid)
            return jsonify({"message": "Avatar removed"})
        file = request.files.get("file")
        if not file or not file.filename:
            return jsonify({"error": "file required"}), 400
        ext = Path(secure_filename(file.filename)).suffix.lower()
        if ext not in AVATAR_EXT_ALLOWED:
            return jsonify({"error": "invalid image type"}), 400
        raw = file.read()
        if len(raw) > AVATAR_MAX_BYTES:
            return jsonify({"error": "file too large"}), 400
        _delete_user_avatars("parent", pid)
        _ensure_avatar_dir()
        dest = AVATAR_DIR / f"parent_{pid}{ext}"
        dest.write_bytes(raw)
        return jsonify({"message": "Avatar updated"})

    @app.route("/api/parents/me", methods=["DELETE"])
    def delete_parent_me():
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        data = request.get_json() or {}
        current_password = data.get("current_password") or ""
        if not current_password:
            return jsonify({"error": "current_password required"}), 400
        with get_db() as db:
            parent = ParentRepository(db).get_by_id(pid)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            if not _verify_password(parent.password_hash, current_password):
                return jsonify({"error": "Current password is incorrect"}), 401

            patients = db.query(PatientModel).filter(PatientModel.parent_id == pid).all()
            patient_ids = [p.id for p in patients]
            if patient_ids:
                db.query(QuizSessionModel).filter(QuizSessionModel.patient_id.in_(patient_ids)).delete(synchronize_session=False)
                uids = [u.id for u in db.query(UserModel).filter(UserModel.patient_id.in_(patient_ids)).all()]
                if uids:
                    db.query(QuizSessionModel).filter(QuizSessionModel.user_id.in_(uids)).delete(synchronize_session=False)
                    db.query(UserModel).filter(UserModel.id.in_(uids)).delete(synchronize_session=False)
                db.query(PatientModel).filter(PatientModel.id.in_(patient_ids)).update(
                    {"assigned_program_id": None},
                    synchronize_session=False,
                )
                db.query(PatientModel).filter(PatientModel.id.in_(patient_ids)).delete(synchronize_session=False)
            _delete_user_avatars("parent", pid)
            sid = getattr(parent, "content_specialist_id", None)
            if sid:
                shadow = db.query(SpecialistModel).filter(SpecialistModel.id == sid).first()
                if shadow and bool(getattr(shadow, "is_shadow", False)):
                    parent.content_specialist_id = None
                    db.flush()
                    _delete_specialist_cascade(db, sid)
                else:
                    parent.content_specialist_id = None
                    db.flush()
            db.delete(parent)
            db.commit()
            return jsonify({"message": "Parent account deleted successfully"})

    @app.route("/api/parents/children", methods=["GET"])
    def list_parent_children():
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        with get_db() as db:
            p_repo = PatientRepository(db)
            s_repo = SessionRepository(db)
            children = p_repo.get_by_parent(pid)
            for c in children:
                c["stats"] = s_repo.get_patient_stats(c["id"])
                c["last_session"] = (s_repo.get_patient_sessions(c["id"], limit=1)[0] if c["stats"]["total_sessions"] else None)
                _attach_program_info(db, c)
            return jsonify(children)

    @app.route("/api/parents/children", methods=["POST"])
    def create_parent_child():
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        data = request.get_json() or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name required"}), 400
        raw_age = data.get("age")
        age: int | None = None
        if raw_age is not None and raw_age != "":
            try:
                age = int(raw_age)
            except (TypeError, ValueError):
                return jsonify({"error": "age must be a number"}), 400
        diagnostic = (data.get("diagnostic") or "").strip() or None
        with get_db() as db:
            parent_repo = ParentRepository(db)
            parent = parent_repo.get_by_id(pid)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            sid, err = _resolve_specialist_id_for_new_parent_child(db, parent)
            if err or sid is None:
                return jsonify({"error": err or "cannot resolve clinician scope"}), 400
            p_repo = PatientRepository(db)
            if not SpecialistRepository(db).get_by_id(sid):
                return jsonify({"error": "specialist scope not found"}), 404
            p = p_repo.create(sid, name, age=age, diagnostic=diagnostic, parent_id=pid)
            db.commit()
            return jsonify(p_repo._to_dict(p)), 201

    @app.route("/api/parents/children/<int:patient_id>", methods=["GET"])
    def get_child(patient_id: int):
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        with get_db() as db:
            p_repo = PatientRepository(db)
            p = p_repo.get_by_id(patient_id)
            if not p or p.parent_id != pid:
                return jsonify({"error": "child not found"}), 404
            s_repo = SessionRepository(db)
            d = p_repo._to_dict(p)
            d["stats"] = s_repo.get_patient_stats(patient_id)
            d["last_session"] = (s_repo.get_patient_sessions(patient_id, limit=1)[0] if d["stats"]["total_sessions"] else None)
            _attach_program_info(db, d)
            return jsonify(d)

    @app.route("/api/parents/children/<int:patient_id>/sessions", methods=["GET"])
    def get_child_sessions(patient_id: int):
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        limit = request.args.get("limit", default=20, type=int)
        with get_db() as db:
            p_repo = PatientRepository(db)
            p = p_repo.get_by_id(patient_id)
            if not p or p.parent_id != pid:
                return jsonify({"error": "child not found"}), 404
            return jsonify(SessionRepository(db).get_patient_sessions(patient_id, limit=limit))

    @app.route("/api/parents/children/<int:patient_id>/assign-program", methods=["PUT"])
    def parent_assign_child_program(patient_id: int):
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        data = request.get_json() or {}
        training_program_id = data.get("training_program_id")
        with get_db() as db:
            p_repo = PatientRepository(db)
            program_repo = TrainingProgramRepository(db)
            patient = p_repo.get_by_id(patient_id)
            if not patient or patient.parent_id != pid:
                return jsonify({"error": "child not found"}), 404
            if training_program_id in ("", None):
                p_repo.assign_program(patient_id, None)
                db.commit()
                cleared = p_repo.get_by_id(patient_id)
                payload = p_repo._to_dict(cleared) if cleared else {}
                _attach_parent_info(db, payload)
                _attach_program_info(db, payload)
                return jsonify(payload)
            try:
                training_program_id = int(training_program_id)
            except (TypeError, ValueError):
                return jsonify({"error": "training_program_id must be a valid integer"}), 400
            program = program_repo.get_by_id(training_program_id)
            if not program or program.specialist_id != patient.specialist_id:
                return jsonify({"error": "training program not found"}), 404
            if program.status != "ready":
                return jsonify({"error": "Only ready training programs can be assigned"}), 400
            parent_row = ParentRepository(db).get_by_id(pid)
            if not parent_row:
                return jsonify({"error": "parent not found"}), 404
            sub = _parent_subscription_dict(parent_row)
            if sub.get("new_program_assign_blocked"):
                return _subscription_error_response(sub, "subscription_assign_blocked")
            p_repo.assign_program(patient_id, training_program_id)
            db.commit()
            fresh = p_repo.get_by_id(patient_id)
            payload = p_repo._to_dict(fresh) if fresh else {}
            _attach_parent_info(db, payload)
            _attach_program_info(db, payload)
            return jsonify(payload)

    @app.route("/api/parents/library", methods=["GET"])
    def list_parent_library():
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        with get_db() as db:
            parent = ParentRepository(db).get_by_id(pid)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            sid = _parent_standalone_library_sid(parent)
            if not sid:
                return jsonify({"error": "Library is only available for family (standalone) parent accounts."}), 403
            _mark_stale_processing_programs(db, specialist_id=sid)
            db.commit()
            repo = TrainingProgramRepository(db)
            return jsonify(repo.get_by_specialist(sid))

    @app.route("/api/parents/library", methods=["POST"])
    def create_parent_library_item():
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        if request.content_type and "multipart/form-data" in request.content_type:
            name = (request.form.get("name") or "").strip()
            pdf_path = (request.form.get("pdf_path") or "").strip() or None
            uploaded_file = request.files.get("pdf_file")
        else:
            data = request.get_json() or {}
            name = (data.get("name") or "").strip()
            pdf_path = (data.get("pdf_path") or "").strip() or None
            uploaded_file = None
        if not name:
            return jsonify({"error": "name required"}), 400
        if uploaded_file and uploaded_file.filename:
            uploads_dir = DATA_DIR / "library_uploads"
            uploads_dir.mkdir(parents=True, exist_ok=True)
            safe_name = secure_filename(uploaded_file.filename) or f"resource-{secrets.token_hex(4)}.pdf"
            unique_name = f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(4)}-{safe_name}"
            saved_path = uploads_dir / unique_name
            uploaded_file.save(saved_path)
            pdf_path = str(saved_path)
        with get_db() as db:
            parent = ParentRepository(db).get_by_id(pid)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            sid = _parent_standalone_library_sid(parent)
            if not sid:
                return jsonify({"error": "Library is only available for family (standalone) parent accounts."}), 403
            if not SpecialistRepository(db).get_by_id(sid):
                return jsonify({"error": "specialist scope not found"}), 404
            sub = _parent_subscription_dict(parent)
            if sub.get("library_frozen"):
                return _subscription_error_response(sub, "subscription_library_frozen")
            repo = TrainingProgramRepository(db)
            initial_status = "processing" if pdf_path else "draft"
            item = repo.create(sid, name=name, pdf_path=pdf_path, status=initial_status)
            db.commit()
            if pdf_path:
                threading.Thread(
                    target=_process_training_program_async,
                    args=(item.id,),
                    daemon=True,
                ).start()
            return jsonify(repo._to_dict(item)), 201

    @app.route("/api/parents/library/<int:item_id>/process", methods=["POST"])
    def process_parent_library_item(item_id: int):
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        with get_db() as db:
            parent = ParentRepository(db).get_by_id(pid)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            sid = _parent_standalone_library_sid(parent)
            if not sid:
                return jsonify({"error": "Library is only available for family (standalone) parent accounts."}), 403
            sub = _parent_subscription_dict(parent)
            if sub.get("library_frozen"):
                return _subscription_error_response(sub, "subscription_library_frozen")
            repo = TrainingProgramRepository(db)
            item = repo.get_by_id(item_id)
            if not item or item.specialist_id != sid:
                return jsonify({"error": "library item not found"}), 404
            if not item.pdf_path:
                return jsonify({"error": "No PDF linked to this library item"}), 400
            item.status = "processing"
            item.error_message = None
            db.commit()
            threading.Thread(
                target=_process_training_program_async,
                args=(item.id,),
                daemon=True,
            ).start()
            return jsonify(repo._to_dict(item)), 200

    @app.route("/api/parents/library/<int:item_id>", methods=["DELETE"])
    def delete_parent_library_item(item_id: int):
        pid = _get_parent_id()
        if not pid:
            return _auth_required()
        with get_db() as db:
            parent = ParentRepository(db).get_by_id(pid)
            if not parent:
                return jsonify({"error": "parent not found"}), 404
            sid = _parent_standalone_library_sid(parent)
            if not sid:
                return jsonify({"error": "Library is only available for family (standalone) parent accounts."}), 403
            sub = _parent_subscription_dict(parent)
            if sub.get("library_frozen"):
                return _subscription_error_response(sub, "subscription_library_frozen")
            repo = TrainingProgramRepository(db)
            item = repo.get_by_id(item_id)
            if not item or item.specialist_id != sid:
                return jsonify({"error": "library item not found"}), 404
            pdf_path = item.pdf_path
            db.query(PatientModel).filter(PatientModel.assigned_program_id == item_id).update(
                {"assigned_program_id": None},
                synchronize_session=False,
            )
            db.query(QuestionModel).filter(QuestionModel.training_program_id == item_id).delete(synchronize_session=False)
            repo.delete(item_id)
            db.commit()
            if pdf_path:
                try:
                    path = Path(pdf_path)
                    uploads_dir = DATA_DIR / "library_uploads"
                    if path.exists() and uploads_dir in path.parents:
                        path.unlink()
                except Exception:
                    pass
            return jsonify({"message": "Library item deleted successfully"})

    @app.route("/api/health")
    def health():
        return jsonify({"service": "Web API", "status": "running"})

    return app
