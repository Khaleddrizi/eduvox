# pyright: reportMissingImports=false
import re
import logging
from flask import Flask, request, jsonify

from backend.config import QUESTION_CACHE_PATH, WEAK_CHUNK_THRESHOLD
from backend.core.quiz_logic import QuestionCache, SessionStore, QuizSelector, QuizService
from backend.database.connection import get_db
from backend.database.repositories import UserRepository, SessionRepository, QuestionRepository, PatientRepository, TrainingProgramRepository
from backend.database.models import QuestionModel

logger = logging.getLogger("AlexaQuiz")

# Short reprompts keep the mic open and reduce awkward silence after long TTS.
_REPROMPT_LINK = "Say link, then spell your eight-character code."
_REPROMPT_QUIZ = "Say give me a quiz to start."
_REPROMPT_ANSWER = "What's your answer? Say A, B, or C."


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
    # Spoken forms like "answer A.", "the answer is B.", trailing punctuation from ASR.
    cleaned = re.sub(r"^\s*(the\s+)?answer\s+(is\s+)?", "", val, flags=re.IGNORECASE).strip()
    cleaned = cleaned.strip(".,;:?!\"'`").strip()
    upper = cleaned.upper()
    if upper in ("A", "B", "C"):
        return upper
    if len(upper) == 1 and upper in "ABC":
        return upper
    m = re.search(r"\b([ABC])\b", upper)
    if m:
        return m.group(1).upper()
    # Short legacy utterances only (avoid treating "answer" as starting with A).
    if upper and upper[0] in "ABC" and len(upper) <= 3:
        return upper[0]
    return ""


def _extract_code(intent: dict) -> str:
    slots = intent.get("slots", {}) or {}
    code_slot = slots.get("code") or {}
    raw = (code_slot.get("value") or "").strip()
    return _normalize_code(raw)


def _normalize_code(raw: str) -> str:
    text = (raw or "").strip().upper()
    if not text:
        return ""

    # Remove common words that Alexa may keep inside the SearchQuery slot.
    text = re.sub(r"\b(LINK|CODE|IS|MY)\b", " ", text)

    # Keep only letters and digits, then search for the actual 8-char patient code.
    compact = re.sub(r"[^A-Z0-9]", "", text)
    match = re.search(r"[A-F0-9]{8}", compact)
    if match:
        return match.group(0)

    # Fallback for unexpected captures: use the trailing 8 chars if possible.
    return compact[-8:] if len(compact) >= 8 else compact


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
                    "Welcome to ADHD Assist. Say link, then spell your eight-character code. "
                    "Example: link, 8, B, 6, A, 6, 7, 1, B. "
                    "You will find the code in the parent or doctor dashboard.",
                    end_session=False,
                    reprompt=_REPROMPT_LINK,
                )

            if request_type == "IntentRequest":
                intent = req.get("intent", {})
                intent_name = intent.get("name", "")

                if intent_name == "AMAZON.HelpIntent":
                    if not _is_user_linked(user_id):
                        return build_alexa_response(
                            "Say link, then your code, letter by letter. "
                            "Then say give me a quiz to start.",
                            reprompt=_REPROMPT_LINK,
                        )
                    return build_alexa_response(
                        "Say give me a quiz to start. Answer with A, B, or C. "
                        "Say end quiz when you are finished to hear your score.",
                        reprompt=_REPROMPT_QUIZ,
                    )

                if intent_name in ("AMAZON.StopIntent", "AMAZON.CancelIntent"):
                    _sessions.pop(session_key)
                    return build_alexa_response("Quiz stopped. Goodbye!", end_session=True)

                if intent_name == "AMAZON.FallbackIntent":
                    if not _is_user_linked(user_id):
                        return build_alexa_response(
                            "Say link, then spell your code.",
                            reprompt=_REPROMPT_LINK,
                        )
                    return build_alexa_response(
                        "Try: give me a quiz.",
                        reprompt=_REPROMPT_QUIZ,
                    )

                if intent_name == "LinkPatientIntent":
                    code = _extract_code(intent)
                    if not code:
                        return build_alexa_response(
                            "Say link, then your eight-character code, one letter or digit at a time.",
                            reprompt=_REPROMPT_LINK,
                        )
                    ok = _link_alexa_to_patient(user_id, code)
                    if ok:
                        patient_name, program_name = _get_linked_patient_context(user_id)
                        details = ""
                        if patient_name and program_name:
                            details = f" Linked to {patient_name}. Program: {program_name}."
                        elif patient_name:
                            details = f" Linked to {patient_name}."
                        return build_alexa_response(
                            "You are linked. Say give me a quiz to start. "
                            "Your results will show on the web dashboard."
                            + details,
                            reprompt=_REPROMPT_QUIZ,
                        )
                    return build_alexa_response(
                        "That code was not found. Check the dashboard and try again.",
                        reprompt=_REPROMPT_LINK,
                    )

                if intent_name == "StartQuizIntent":
                    if not _is_user_linked(user_id):
                        return build_alexa_response(
                            "Link your account first. Say link, then your code from the dashboard.",
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
                            "No questions are ready yet. Ask the doctor to assign a ready program.",
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
                    rp = (
                        None
                        if end
                        else (quiz_reprompt or _REPROMPT_ANSWER)
                    )
                    return build_alexa_response(text, end_session=end, reprompt=rp)

                if intent_name == "EndQuizIntent":
                    text, end, snapshot = _quiz.end_quiz(session_key)
                    if snapshot:
                        _save_session_to_db(user_id, snapshot)
                    result_msg = text
                    if snapshot and _is_user_linked(user_id):
                        result_msg = text + " Check the web dashboard to see your progress."
                    return build_alexa_response(result_msg, end_session=end)

            return build_alexa_response(
                "Say give me a quiz to start.",
                end_session=False,
                reprompt=_REPROMPT_QUIZ if _is_user_linked(user_id) else _REPROMPT_LINK,
            )

        except Exception as e:
            logger.exception("Alexa webhook error: %s", e)
            return build_alexa_response(
                "A server error occurred. Please try again.", end_session=True
            )

    _alexa_probe = {"service": "Alexa Quiz API", "status": "running"}

    @app.route("/", methods=["GET"])
    @app.route("/health", methods=["GET"])
    def root():
        return jsonify(_alexa_probe)

    @app.route("/test", methods=["GET"])
    def test():
        return jsonify({"service": "Alexa Quiz API", "status": "running"})

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
            q_repo = QuestionRepository(db)

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
                return False
            user_repo.link_to_patient(alexa_user_id, patient.id)
            db.commit()
            return True
    except Exception as e:
        logger.warning("Could not link Alexa to patient: %s", e)
        return False


def _get_patient_quiz_questions(alexa_user_id: str) -> tuple[list[dict], str | None]:
    try:
        with get_db() as db:
            user = UserRepository(db).get_by_alexa_id(alexa_user_id)
            if not user or not getattr(user, "patient_id", None):
                return [], "Please say link followed by your code first."

            patient = PatientRepository(db).get_by_id(user.patient_id)
            if not patient:
                return [], "This linked patient was not found. Please link again using your code."

            program_id = getattr(patient, "assigned_program_id", None)
            if not program_id:
                return [], "No training program is assigned to this patient yet. Please ask the doctor to assign one first."

            questions = QuestionRepository(db).get_by_training_program_id(program_id)
            if not questions:
                return [], "This patient's assigned program has no ready questions yet. Please ask the doctor to process the PDF first."

            return questions, None
    except Exception as e:
        logger.warning("Could not load patient quiz questions: %s", e)
        return [], "Could not load the assigned quiz right now. Please try again later."


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
