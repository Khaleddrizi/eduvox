# pyright: reportMissingImports=false
import json
import re
import logging
from flask import Flask, request, jsonify

from backend.config import QUESTION_CACHE_PATH, WEAK_CHUNK_THRESHOLD
from backend.core.alexa_codes import normalize_alexa_link_code
from backend.core.quiz_logic import (
    QuestionCache,
    SessionStore,
    QuizSelector,
    QuizService,
    normalize_mcq_letter,
)
from backend.database.connection import get_db
from backend.database.repositories import UserRepository, SessionRepository, QuestionRepository, PatientRepository, TrainingProgramRepository
from backend.database.models import QuestionModel, PatientModel

logger = logging.getLogger("AlexaQuiz")

_REPROMPT_LINK = "قل: اربط، ثم انطق رمزك المكوّن من ستة أرقام."
_REPROMPT_QUIZ = "قل: ابدأ الاختبار."
_REPROMPT_ANSWER = "ما إجابتك؟ قل: أ، أو ب، أو ج."


def build_alexa_response(
    text: str,
    end_session: bool = False,
    reprompt: str | None = None,
):
    response: dict = {
        "outputSpeech": {"type": "PlainText", "text": text},
        "shouldEndSession": end_session,
    }
    if reprompt and not end_session:
        response["reprompt"] = {"outputSpeech": {"type": "PlainText", "text": reprompt}}
    return jsonify({"version": "1.0", "response": response})


def _extract_answer(intent: dict) -> str:
    slots = intent.get("slots", {}) or {}
    ans_slot = slots.get("answer") or {}
    val = (ans_slot.get("value") or "").strip()
    if not val and ans_slot.get("resolutions"):
        try:
            per_auth = ans_slot["resolutions"].get("resolutionsPerAuthority", [])
            if per_auth and per_auth[0].get("values"):
                val = per_auth[0]["values"][0].get("value", {}).get("name", "")
        except (KeyError, IndexError, TypeError):
            pass
    val = (val or "").strip()
    if not val:
        return ""
    cleaned = re.sub(r"^\s*(the\s+)?answer\s+(is\s+)?", "", val, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"^\s*(الجواب|إجابة|اجابة)\s*(هي\s*)?", "", cleaned).strip()
    cleaned = cleaned.strip(".,;:?!\"'`").strip()
    letter = normalize_mcq_letter(cleaned)
    if letter:
        return letter
    upper = cleaned.upper()
    m = re.search(r"\b([ABC])\b", upper)
    if m:
        return m.group(1).upper()
    if upper and upper[0] in "ABC" and len(upper) <= 3:
        return upper[0]
    return ""


def _collect_code_raw_candidates(intent: dict, payload: dict | None = None) -> list[str]:
    """Gather every string Alexa might have put the typed/spoken code in."""
    candidates: list[str] = []
    slots = intent.get("slots", {}) or {}
    code_slot = slots.get("code") or {}

    def add(val: object) -> None:
        if val is None:
            return
        s = str(val).strip()
        if s and s not in candidates:
            candidates.append(s)

    add(code_slot.get("value"))
    slot_value = code_slot.get("slotValue")
    if isinstance(slot_value, dict):
        add(slot_value.get("value"))
    original = code_slot.get("originalDetokenizedValue")
    if isinstance(original, dict):
        add(original.get("value"))
    if code_slot.get("resolutions"):
        try:
            per_auth = code_slot["resolutions"].get("resolutionsPerAuthority", [])
            for authority in per_auth:
                for item in authority.get("values", []):
                    value = item.get("value", {})
                    add(value.get("name"))
                    add(value.get("id"))
        except (KeyError, IndexError, TypeError):
            pass

    if payload:
        try:
            blob = json.dumps(payload, ensure_ascii=False)
            for match in re.finditer(r"(?<!\d)\d{6}(?!\d)", blob):
                add(match.group(0))
        except (TypeError, ValueError):
            pass

    return candidates


def _extract_code(intent: dict, payload: dict | None = None) -> str:
    for raw in _collect_code_raw_candidates(intent, payload):
        normalized = normalize_alexa_link_code(raw)
        if normalized:
            return normalized
    return ""


def create_alexa_app(
    cache: QuestionCache | None = None,
    session_store: SessionStore | None = None,
    selector: QuizSelector | None = None,
) -> Flask:
    app = Flask(__name__)
    _cache = cache or QuestionCache(QUESTION_CACHE_PATH)
    if not cache:
        _cache.load()
    _sessions = session_store or SessionStore()
    _selector = selector or QuizSelector(threshold=WEAK_CHUNK_THRESHOLD)
    _quiz = QuizService(_cache, _sessions, _selector)

    @app.route("/alexa_quiz", methods=["POST"])
    def alexa_webhook():
        try:
            data = request.get_json() or {}
            req = data.get("request", {})
            request_type = req.get("type")
            session = data.get("session", {})
            session_id = session.get("sessionId", "")
            user_id = session.get("user", {}).get("userId", "")
            is_new = session.get("new", False)

            session_key = _sessions.resolve_key(session_id, user_id)
            _sessions.clear_if_new(session_key, is_new)

            if request_type == "LaunchRequest":
                return build_alexa_response(
                    "مرحباً بك في أثيريا. قل: اربط، ثم انطق رمز الطفل المكوّن من ستة أرقام. "
                    "مثال: اربط، 4، 8، 2، 9، 1، 6. "
                    "ستجد الرمز في لوحة ولي الأمر أو المختص.",
                    end_session=False,
                    reprompt=_REPROMPT_LINK,
                )

            if request_type == "IntentRequest":
                intent = req.get("intent", {})
                intent_name = intent.get("name", "")

                if intent_name == "AMAZON.HelpIntent":
                    if not _is_user_linked(user_id):
                        return build_alexa_response(
                            "قل: اربط، ثم انطق الرمز المكوّن من ستة أرقام، رقماً رقماً. "
                            "بعدها قل: ابدأ الاختبار.",
                            reprompt=_REPROMPT_LINK,
                        )
                    return build_alexa_response(
                        "قل: ابدأ الاختبار. أجب بـ أ، أو ب، أو ج. "
                        "عند الانتهاء قل: أنهِ الاختبار لسماع نتيجتك.",
                        reprompt=_REPROMPT_QUIZ,
                    )

                if intent_name in ("AMAZON.StopIntent", "AMAZON.CancelIntent"):
                    _sessions.pop(session_key)
                    return build_alexa_response("تم إيقاف الاختبار. إلى اللقاء!", end_session=True)

                if intent_name == "AMAZON.FallbackIntent":
                    if not _is_user_linked(user_id):
                        fallback_code = _extract_code(intent, data)
                        if fallback_code:
                            ok = _link_alexa_to_patient(user_id, fallback_code)
                            if ok:
                                patient_name, program_name = _get_linked_patient_context(user_id)
                                details = ""
                                if patient_name and program_name:
                                    details = f" تم الربط مع {patient_name}. البرنامج: {program_name}."
                                elif patient_name:
                                    details = f" تم الربط مع {patient_name}."
                                return build_alexa_response(
                                    "تم الربط بنجاح. قل: ابدأ الاختبار."
                                    + details,
                                    reprompt=_REPROMPT_QUIZ,
                                )
                            return build_alexa_response(
                                f"لم أجد الرمز {fallback_code}. انسخه من اللوحة كما هو، "
                                "مثال: اربط 469573.",
                                reprompt=_REPROMPT_LINK,
                            )
                        return build_alexa_response(
                            "قل: اربط ثم الرمز. عند الكتابة في المحاكي استخدم: اربط 469573",
                            reprompt=_REPROMPT_LINK,
                        )
                    return build_alexa_response(
                        "جرّب: ابدأ الاختبار.",
                        reprompt=_REPROMPT_QUIZ,
                    )

                if intent_name == "LinkPatientIntent":
                    code = _extract_code(intent, data)
                    if not code:
                        logger.info("Alexa link: no code parsed intent=%s", intent_name)
                        return build_alexa_response(
                            "لم أفهم الرمز. اكتب أو قل: اربط ثم ستة أرقام بدون مسافات، "
                            "مثل: اربط 469573.",
                            reprompt=_REPROMPT_LINK,
                        )
                    logger.info("Alexa link attempt code=%s", code)
                    ok = _link_alexa_to_patient(user_id, code)
                    if ok:
                        patient_name, program_name = _get_linked_patient_context(user_id)
                        details = ""
                        if patient_name and program_name:
                            details = f" تم الربط مع {patient_name}. البرنامج: {program_name}."
                        elif patient_name:
                            details = f" تم الربط مع {patient_name}."
                        return build_alexa_response(
                            "تم الربط بنجاح. قل: ابدأ الاختبار. "
                            "ستظهر نتائجك في لوحة المتابعة على الموقع."
                            + details,
                            reprompt=_REPROMPT_QUIZ,
                        )
                    return build_alexa_response(
                        f"لم أجد الرمز {code} في النظام. تأكد أنه نفس الرمز في لوحة أثيريا "
                        "وأن مهارة Alexa متصلة بخادم Render (eduvox-alexa) وليس ngrok قديم.",
                        reprompt=_REPROMPT_LINK,
                    )

                if intent_name == "StartQuizIntent":
                    if not _is_user_linked(user_id):
                        return build_alexa_response(
                            "اربط حساب الطفل أولاً. قل: اربط، ثم الرمز من اللوحة.",
                            reprompt=_REPROMPT_LINK,
                        )
                    questions, error_message = _get_patient_quiz_questions(user_id)
                    if error_message:
                        return build_alexa_response(
                            error_message,
                            reprompt=_REPROMPT_QUIZ if _is_user_linked(user_id) else _REPROMPT_LINK,
                        )
                    linked_patient_id = _get_linked_patient_id(user_id)
                    text = _quiz.start_quiz(session_key, questions=questions)
                    if not text:
                        return build_alexa_response(
                            "لا توجد أسئلة جاهزة بعد. اطلب من المختص تعيين برنامج جاهز.",
                            reprompt=_REPROMPT_QUIZ,
                        )
                    if linked_patient_id:
                        s = _sessions.get(session_key)
                        if s is not None:
                            s["patient_id"] = linked_patient_id
                    return build_alexa_response(
                        text, end_session=False, reprompt=_REPROMPT_ANSWER
                    )

                if intent_name == "AnswerIntent":
                    answer = _extract_answer(intent)
                    text, end, quiz_reprompt = _quiz.answer_and_next(session_key, answer)
                    rp = None if end else (quiz_reprompt or _REPROMPT_ANSWER)
                    return build_alexa_response(text, end_session=end, reprompt=rp)

                if intent_name == "EndQuizIntent":
                    text, end, snapshot = _quiz.end_quiz(session_key)
                    if snapshot:
                        _save_session_to_db(user_id, snapshot)
                    result_msg = text
                    if snapshot and _is_user_linked(user_id):
                        result_msg = text + " راجع لوحة المتابعة على الموقع لمعرفة التقدم."
                    return build_alexa_response(result_msg, end_session=end)

            return build_alexa_response(
                "قل: ابدأ الاختبار.",
                end_session=False,
                reprompt=_REPROMPT_QUIZ if _is_user_linked(user_id) else _REPROMPT_LINK,
            )

        except Exception as e:
            logger.exception("Alexa webhook error: %s", e)
            return build_alexa_response(
                "حدث خطأ في الخادم. حاول مرة أخرى.", end_session=True
            )

    _alexa_probe = {"service": "Alexa Quiz API", "status": "running"}

    @app.route("/", methods=["GET"])
    @app.route("/health", methods=["GET"])
    def root():
        body = dict(_alexa_probe)
        try:
            with get_db() as db:
                body["database"] = "ok"
                body["patients_with_codes"] = (
                    db.query(PatientModel)
                    .filter(PatientModel.alexa_code.isnot(None))
                    .count()
                )
        except Exception as exc:
            body["database"] = "error"
            body["database_error"] = str(exc)[:200]
        return jsonify(body)

    @app.route("/test", methods=["GET"])
    def test():
        return jsonify(_alexa_probe)

    return app


def _save_session_to_db(alexa_user_id: str, snapshot: dict) -> None:
    try:
        score = snapshot.get("score", 0)
        questions = snapshot.get("questions", [])
        wrong = list(set(snapshot.get("wrong_topics", [])))
        total = len(questions)

        with get_db() as db:
            user_repo = UserRepository(db)
            session_repo = SessionRepository(db)

            user = user_repo.get_or_create(alexa_user_id)
            target_patient_id = snapshot.get("patient_id") or user.patient_id
            session_repo.save_session(
                user_id=user.id,
                score=score,
                total=total,
                wrong_topics=wrong,
                patient_id=target_patient_id,
            )

            for q in questions:
                db_id = q.get("db_id")
                if not db_id:
                    continue
                row = db.query(QuestionModel).filter(QuestionModel.id == db_id).first()
                if row:
                    row.times_asked = q.get("times_asked", 0)
                    row.times_correct = q.get("times_correct", 0)

            db.commit()
            logger.info("Session saved to DB: user=%s score=%s/%s", alexa_user_id, score, total)
    except Exception as e:
        logger.warning("Could not save session to DB: %s", e)


def _is_user_linked(alexa_user_id: str) -> bool:
    try:
        with get_db() as db:
            user_repo = UserRepository(db)
            user = user_repo.get_by_alexa_id(alexa_user_id)
            return user is not None and getattr(user, "patient_id", None) is not None
    except Exception:
        return False


def _link_alexa_to_patient(alexa_user_id: str, code: str) -> bool:
    try:
        with get_db() as db:
            patient_repo = PatientRepository(db)
            user_repo = UserRepository(db)
            patient = patient_repo.get_by_alexa_code(code)
            if not patient:
                logger.info("Alexa link: patient not found for code=%s", code)
                return False
            user_repo.link_to_patient(alexa_user_id, patient.id)
            db.commit()
            logger.info(
                "Alexa link: linked user=%s patient_id=%s code=%s",
                alexa_user_id,
                patient.id,
                code,
            )
            return True
    except Exception as e:
        logger.warning("Could not link Alexa to patient: %s", e)
        return False


def _get_patient_quiz_questions(alexa_user_id: str) -> tuple[list[dict], str | None]:
    try:
        with get_db() as db:
            user = UserRepository(db).get_by_alexa_id(alexa_user_id)
            if not user or not getattr(user, "patient_id", None):
                return [], "قل: اربط، ثم انطق رمز الطفل أولاً."

            patient = PatientRepository(db).get_by_id(user.patient_id)
            if not patient:
                return [], "لم أجد هذا الطفل. اربط الرمز مرة أخرى."

            program_id = getattr(patient, "assigned_program_id", None)
            if not program_id:
                return [], "لا يوجد برنامج تدريبي معيّن لهذا الطفل. اطلب من المختص تعيين برنامج."

            questions = QuestionRepository(db).get_by_training_program_id(program_id)
            if not questions:
                return [], "البرنامج المعيّن لا يحتوي أسئلة جاهزة بعد. اطلب من المختص تجهيز البرنامج."

            return questions, None
    except Exception as e:
        logger.warning("Could not load patient quiz questions: %s", e)
        return [], "تعذّر تحميل الاختبار الآن. حاول مرة أخرى لاحقاً."


def _get_linked_patient_context(alexa_user_id: str) -> tuple[str | None, str | None]:
    try:
        with get_db() as db:
            user = UserRepository(db).get_by_alexa_id(alexa_user_id)
            if not user or not getattr(user, "patient_id", None):
                return None, None
            patient = PatientRepository(db).get_by_id(user.patient_id)
            if not patient:
                return None, None
            program_name = None
            if getattr(patient, "assigned_program_id", None):
                program = TrainingProgramRepository(db).get_by_id(patient.assigned_program_id)
                if program:
                    program_name = program.name
            return patient.name, program_name
    except Exception:
        return None, None


def _get_linked_patient_id(alexa_user_id: str) -> int | None:
    try:
        with get_db() as db:
            user = UserRepository(db).get_by_alexa_id(alexa_user_id)
            if not user or not getattr(user, "patient_id", None):
                return None
            return int(user.patient_id)
    except Exception:
        return None
