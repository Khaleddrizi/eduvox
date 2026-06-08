# pyright: reportMissingImports=false
import json
import re
import logging
from flask import Flask, g, request, jsonify

from backend.config import QUESTION_CACHE_PATH, WEAK_CHUNK_THRESHOLD
from backend.core.alexa_codes import normalize_alexa_link_code
from backend.core.alexa_i18n import (
    collect_speech_candidates,
    detect_alexa_locale,
    extract_user_utterance,
    get_alexa_copy,
    link_success_speech,
    quiz_start_intro,
    patient_quiz_errors,
    request_text_blob,
    resolve_effective_intent,
    user_utterance_blob,
    wants_link,
    wants_start_quiz,
    wants_training_program,
)
from backend.core.adventure_quiz import (
    AdventureQuizService,
    adventure_speech_hint,
    export_adventure_session_attributes,
    infer_yes_from_intent,
    is_adventure_program,
    is_adventure_readiness_step,
    pick_speech_for_step,
    restore_adventure_session,
)
from backend.core.quiz_logic import (
    QuestionCache,
    SessionStore,
    QuizSelector,
    QuizService,
    extract_mcq_from_utterance,
    normalize_mcq_letter,
)
from backend.database.connection import get_db
from backend.database.repositories import UserRepository, SessionRepository, QuestionRepository, PatientRepository, TrainingProgramRepository
from backend.database.models import QuestionModel, PatientModel

logger = logging.getLogger("AlexaQuiz")


def build_alexa_response(
    text: str,
    end_session: bool = False,
    reprompt: str | None = None,
    elicit_answer_slot: bool = False,
):
    response: dict = {
        "outputSpeech": {"type": "PlainText", "text": text},
        "shouldEndSession": end_session,
    }
    if reprompt and not end_session:
        response["reprompt"] = {"outputSpeech": {"type": "PlainText", "text": reprompt}}
    if elicit_answer_slot and not end_session:
        response["directives"] = [
            {
                "type": "Dialog.ElicitSlot",
                "slotToElicit": "answer",
                "updatedIntent": {
                    "name": "AnswerIntent",
                    "confirmationStatus": "NONE",
                    "slots": {
                        "answer": {
                            "name": "answer",
                            "confirmationStatus": "NONE",
                        }
                    },
                },
            }
        ]
    body: dict = {"version": "1.0", "response": response}
    sessions = getattr(g, "alexa_sessions", None)
    session_key = getattr(g, "alexa_session_key", None)
    if sessions and session_key:
        attrs = export_adventure_session_attributes(sessions.get(session_key))
        if attrs:
            # Alexa requires sessionAttributes values to be strings.
            body["sessionAttributes"] = {
                str(k): v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
                for k, v in attrs.items()
            }
    return jsonify(body)


def build_alexa_session_end_response():
    """SessionEndedRequest must not include speech, reprompt, or directives."""
    return jsonify({"version": "1.0"})


def build_alexa_can_fulfill_response():
    return jsonify(
        {
            "version": "1.0",
            "response": {
                "canFulfillIntent": {
                    "canFulfill": "YES",
                    "slots": {},
                }
            },
        }
    )


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


def _handle_start_quiz(
    session_key: str,
    user_id: str,
    quiz: QuizService,
    adventure: AdventureQuizService,
    sessions: SessionStore,
    locale: str,
    copy,
):
    if not _is_user_linked(user_id):
        return build_alexa_response(copy.link_need_child, reprompt=copy.reprompt_link)
    questions, error_message = _get_patient_quiz_questions(user_id, locale)
    if error_message:
        return build_alexa_response(
            error_message,
            reprompt=copy.reprompt_quiz if _is_user_linked(user_id) else copy.reprompt_link,
        )
    linked_patient_id = _get_linked_patient_id(user_id)
    patient_name, _ = _get_linked_patient_context(user_id)
    if is_adventure_program(questions):
        text = adventure.start(
            session_key,
            questions,
            locale=locale,
            patient_id=linked_patient_id,
            patient_name=patient_name,
        )
        reprompt = copy.reprompt_answer_free or copy.reprompt_answer
    else:
        text = quiz.start_quiz(session_key, questions=questions, locale=locale)
        reprompt = copy.reprompt_answer
        if text and linked_patient_id:
            s = sessions.get(session_key)
            if s is not None:
                s["patient_id"] = linked_patient_id
                if patient_name:
                    s["patient_name"] = patient_name
        intro = quiz_start_intro(copy, locale, patient_name)
        text = (intro + text) if text else None
    if not text:
        return build_alexa_response(copy.quiz_no_questions, reprompt=copy.reprompt_quiz)
    return build_alexa_response(
        text,
        end_session=False,
        reprompt=reprompt,
    )


def _session_is_adventure(sessions: SessionStore, session_key: str) -> bool:
    s = sessions.get(session_key)
    return bool(s and s.get("mode") == "adventure")


def _resolve_answer(intent: dict, data: dict, user_blob: str) -> str:
    answer = _extract_answer(intent)
    if answer:
        return answer
    utterance = user_blob or extract_user_utterance(intent, data)
    return extract_mcq_from_utterance(utterance)


def _extract_spoken_answer_raw(intent: dict) -> str:
    """Slot text as spoken (not reduced to A/B/C)."""
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
    if val:
        return val.strip()
    return extract_user_utterance(intent, None)


def _resolve_answer_for_session(
    intent: dict,
    data: dict,
    user_blob: str,
    sessions: SessionStore,
    session_key: str,
) -> str:
    if _session_is_adventure(sessions, session_key):
        intent_name = intent.get("name", "")
        yes = infer_yes_from_intent(intent_name)
        if yes:
            return yes
        session = sessions.get(session_key)
        steps = (session or {}).get("adventure_steps") or []
        idx = int((session or {}).get("step_index", 0))
        step = steps[idx] if session and idx < len(steps) else {}
        candidates: list[str] = []
        if user_blob:
            candidates.append(user_blob)
        candidates.extend(collect_speech_candidates(intent, data))
        raw_slot = _extract_spoken_answer_raw(intent)
        if raw_slot:
            candidates.append(raw_slot)
        if not candidates:
            candidates.append(extract_user_utterance(intent, data))
        seen: set[str] = set()
        unique: list[str] = []
        for c in candidates:
            c = (c or "").strip()
            if c and c not in seen:
                seen.add(c)
                unique.append(c)
        if step:
            loc = (session or {}).get("locale") or "ar"
            adventure_locale = "en" if str(loc).startswith("en") else "ar"
            picked = pick_speech_for_step(unique, step, adventure_locale)
            if picked:
                logger.info(
                    "Adventure speech candidates=%r picked=%r intent=%s",
                    unique,
                    picked,
                    intent_name,
                )
                return picked
        return unique[0] if unique else ""
    return _resolve_answer(intent, data, user_blob)


def _try_restore_adventure(
    session_key: str,
    user_id: str,
    alexa_session: dict,
    sessions: SessionStore,
    locale: str,
) -> None:
    if sessions.get(session_key):
        return
    questions, error_message = _get_patient_quiz_questions(user_id, locale)
    if error_message or not is_adventure_program(questions):
        return
    patient_name, _ = _get_linked_patient_context(user_id)
    linked_patient_id = _get_linked_patient_id(user_id)
    attrs = alexa_session.get("attributes") or {}
    if restore_adventure_session(
        sessions,
        session_key,
        attrs,
        questions,
        patient_id=linked_patient_id,
        patient_name=patient_name,
    ):
        return


def _handle_quiz_answer_attempt(
    session_key: str,
    user_id: str,
    intent: dict,
    data: dict,
    user_blob: str,
    quiz: QuizService,
    adventure: AdventureQuizService,
    sessions: SessionStore,
    copy,
):
    """During an active quiz: parse answer or ask to repeat — never restart."""
    reprompt_free = getattr(copy, "reprompt_answer_free", None) or copy.reprompt_answer
    if _session_is_adventure(sessions, session_key):
        intent_name = intent.get("name", "")
        answer = _resolve_answer_for_session(intent, data, user_blob, sessions, session_key)
        session = sessions.get(session_key)
        if not (answer or "").strip():
            hint = adventure_speech_hint(session)
            logger.warning(
                "Adventure empty speech intent=%s user_blob=%r session_step=%s",
                intent_name,
                user_blob,
                (session or {}).get("step_index"),
            )
            loc = (session or {}).get("locale") or "ar"
            if str(loc).startswith("en"):
                if intent_name == "AMAZON.FallbackIntent":
                    msg = f"I didn't receive your words from Alexa. {hint}"
                else:
                    msg = f"I didn't hear your answer. {hint}"
            elif intent_name == "AMAZON.FallbackIntent":
                msg = f"لم أستقبل كلمتك من أليكسا. {hint}"
            else:
                msg = f"لم أسمع إجابتك. {hint}"
            return build_alexa_response(
                msg,
                end_session=False,
                reprompt=hint,
                elicit_answer_slot=True,
            )
        text, end, snapshot = adventure.answer(session_key, answer)
        if snapshot:
            _save_session_to_db(user_id, snapshot)
            if _is_user_linked(user_id):
                text = text + copy.quiz_end_dashboard
        return build_alexa_response(
            text,
            end_session=end,
            reprompt=None if end else reprompt_free,
        )

    answer = _resolve_answer(intent, data, user_blob)
    if answer:
        text, end, quiz_reprompt = quiz.answer_and_next(session_key, answer)
        rp = None if end else (quiz_reprompt or copy.reprompt_answer)
        return build_alexa_response(text, end_session=end, reprompt=rp)
    text, _ = quiz.repeat_current_question(session_key)
    return build_alexa_response(
        text,
        end_session=False,
        reprompt=copy.reprompt_answer,
    )


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
    _adventure = AdventureQuizService(_sessions)

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
            g.alexa_sessions = _sessions
            g.alexa_session_key = session_key
            g.alexa_request_data = data
            _sessions.clear_if_new(session_key, is_new)
            locale = detect_alexa_locale(data)
            copy = get_alexa_copy(locale)
            logger.info(
                "Alexa request_type=%s locale=%s session_new=%s user=%s",
                request_type,
                locale,
                is_new,
                (user_id or "")[:24],
            )

            if request_type == "SessionEndedRequest":
                return build_alexa_session_end_response()

            if request_type == "CanFulfillIntentRequest":
                return build_alexa_can_fulfill_response()

            if user_id and _is_user_linked(user_id):
                _try_restore_adventure(session_key, user_id, session, _sessions, locale)

            if request_type == "LaunchRequest":
                return build_alexa_response(
                    copy.welcome,
                    end_session=False,
                    reprompt=copy.reprompt_link,
                )

            if request_type == "IntentRequest":
                intent = req.get("intent", {})
                intent_name = intent.get("name", "")
                utterance_blob = request_text_blob(intent, data, locale)
                user_blob = user_utterance_blob(intent, data, locale)
                has_active_quiz = _sessions.get(session_key) is not None
                intent_name = resolve_effective_intent(
                    intent_name, user_blob or utterance_blob, has_active_quiz, locale
                )
                raw_intent_name = req.get("intent", {}).get("name", "")
                logger.info(
                    "Alexa locale=%s intent=%s effective=%s user=%r active_quiz=%s adventure=%s",
                    locale,
                    raw_intent_name,
                    intent_name,
                    user_blob[:80],
                    has_active_quiz,
                    _session_is_adventure(_sessions, session_key),
                )

                yes_text = infer_yes_from_intent(intent_name) or infer_yes_from_intent(raw_intent_name)
                if (
                    has_active_quiz
                    and _session_is_adventure(_sessions, session_key)
                    and yes_text
                    and is_adventure_readiness_step(_sessions.get(session_key))
                ):
                    return _handle_quiz_answer_attempt(
                        session_key,
                        user_id,
                        intent,
                        data,
                        yes_text,
                        _quiz,
                        _adventure,
                        _sessions,
                        copy,
                    )

                if intent_name == "AMAZON.HelpIntent":
                    if has_active_quiz:
                        rp = (
                            copy.reprompt_answer_free
                            if _session_is_adventure(_sessions, session_key)
                            else copy.reprompt_answer
                        )
                        return build_alexa_response(
                            copy.help_during_quiz,
                            reprompt=rp,
                        )
                    if not _is_user_linked(user_id):
                        return build_alexa_response(copy.welcome, reprompt=copy.reprompt_link)
                    if wants_start_quiz(user_blob, locale):
                        return _handle_start_quiz(
                            session_key, user_id, _quiz, _adventure, _sessions, locale, copy
                        )
                    return build_alexa_response(copy.help_linked, reprompt=copy.reprompt_quiz)

                if intent_name in ("AMAZON.StopIntent", "AMAZON.CancelIntent"):
                    _sessions.pop(session_key)
                    return build_alexa_response(copy.stop, end_session=True)

                if intent_name == "AMAZON.FallbackIntent":
                    if has_active_quiz:
                        return _handle_quiz_answer_attempt(
                            session_key,
                            user_id,
                            intent,
                            data,
                            user_blob,
                            _quiz,
                            _adventure,
                            _sessions,
                            copy,
                        )
                    if not _is_user_linked(user_id):
                        if wants_training_program(utterance_blob, locale) and not wants_link(
                            utterance_blob, locale
                        ):
                            return build_alexa_response(copy.welcome, reprompt=copy.reprompt_link)
                        fallback_code = _extract_code(intent, data)
                        if fallback_code:
                            ok = _link_alexa_to_patient(user_id, fallback_code)
                            if ok:
                                patient_name, _ = _get_linked_patient_context(user_id)
                                return build_alexa_response(
                                    link_success_speech(copy, patient_name),
                                    reprompt=copy.reprompt_quiz,
                                )
                            return build_alexa_response(
                                copy.link_not_found_short.format(code=fallback_code),
                                reprompt=copy.reprompt_link,
                            )
                        return build_alexa_response(copy.welcome, reprompt=copy.reprompt_link)
                    if wants_start_quiz(user_blob, locale):
                        return _handle_start_quiz(
                            session_key, user_id, _quiz, _adventure, _sessions, locale, copy
                        )
                    return build_alexa_response(
                        copy.fallback_try_quiz, reprompt=copy.reprompt_quiz
                    )

                if intent_name == "LinkPatientIntent":
                    code = _extract_code(intent, data)
                    if not code:
                        logger.info("Alexa link: no code parsed intent=%s", intent_name)
                        return build_alexa_response(copy.link_no_code, reprompt=copy.reprompt_link)
                    logger.info("Alexa link attempt code=%s locale=%s", code, locale)
                    ok = _link_alexa_to_patient(user_id, code)
                    if ok:
                        patient_name, _ = _get_linked_patient_context(user_id)
                        return build_alexa_response(
                            link_success_speech(copy, patient_name),
                            reprompt=copy.reprompt_quiz,
                        )
                    return build_alexa_response(
                        copy.link_not_found.format(code=code),
                        reprompt=copy.reprompt_link,
                    )

                if intent_name == "StartQuizIntent":
                    if has_active_quiz:
                        return _handle_quiz_answer_attempt(
                            session_key,
                            user_id,
                            intent,
                            data,
                            user_blob,
                            _quiz,
                            _adventure,
                            _sessions,
                            copy,
                        )
                    return _handle_start_quiz(
                        session_key, user_id, _quiz, _adventure, _sessions, locale, copy
                    )

                if intent_name == "AnswerIntent":
                    return _handle_quiz_answer_attempt(
                        session_key,
                        user_id,
                        intent,
                        data,
                        user_blob,
                        _quiz,
                        _adventure,
                        _sessions,
                        copy,
                    )

                if intent_name == "EndQuizIntent":
                    if wants_start_quiz(utterance_blob, locale) and not has_active_quiz:
                        return _handle_start_quiz(
                            session_key, user_id, _quiz, _adventure, _sessions, locale, copy
                        )
                    if _session_is_adventure(_sessions, session_key):
                        text, end, snapshot = _adventure.end_early(session_key)
                    else:
                        text, end, snapshot = _quiz.end_quiz(session_key)
                    if snapshot:
                        _save_session_to_db(user_id, snapshot)
                    result_msg = text
                    if snapshot and _is_user_linked(user_id):
                        result_msg = text + copy.quiz_end_dashboard
                    return build_alexa_response(result_msg, end_session=end)

                if has_active_quiz:
                    return _handle_quiz_answer_attempt(
                        session_key,
                        user_id,
                        intent,
                        data,
                        user_blob,
                        _quiz,
                        _adventure,
                        _sessions,
                        copy,
                    )

            if _is_user_linked(user_id):
                return build_alexa_response(
                    copy.default_linked,
                    end_session=False,
                    reprompt=copy.reprompt_quiz,
                )
            return build_alexa_response(
                copy.default_unlinked,
                end_session=False,
                reprompt=copy.reprompt_link,
            )

        except Exception as e:
            logger.exception("Alexa webhook error: %s", e)
            return build_alexa_response(
                get_alexa_copy("ar").server_error, end_session=True
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


def _get_patient_quiz_questions(alexa_user_id: str, locale: str = "ar") -> tuple[list[dict], str | None]:
    err = patient_quiz_errors(locale)
    try:
        with get_db() as db:
            user = UserRepository(db).get_by_alexa_id(alexa_user_id)
            if not user or not getattr(user, "patient_id", None):
                return [], err["not_linked"]

            patient = PatientRepository(db).get_by_id(user.patient_id)
            if not patient:
                return [], err["no_patient"]

            program_id = getattr(patient, "assigned_program_id", None)
            if not program_id:
                return [], err["no_program"]

            questions = QuestionRepository(db).get_by_training_program_id(program_id)
            if not questions:
                return [], err["no_questions"]

            return questions, None
    except Exception as e:
        logger.warning("Could not load patient quiz questions: %s", e)
        return [], err["load_failed"]


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
