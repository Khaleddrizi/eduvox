"""Alexa skill copy and locale helpers (Arabic + English skills, one backend)."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass

from backend.core.alexa_codes import looks_like_link_code_attempt, normalize_arabic_speech

AlexaLocale = str  # "ar" | "en"


@dataclass(frozen=True)
class AlexaCopy:
    reprompt_link: str
    reprompt_quiz: str
    reprompt_answer: str
    reprompt_answer_free: str
    welcome: str
    link_success: str
    help_linked: str
    help_during_quiz: str
    stop: str
    fallback_try_quiz: str
    link_need_child: str
    link_no_code: str
    link_not_found: str
    link_not_found_short: str
    quiz_intro: str
    quiz_no_questions: str
    quiz_end_dashboard: str
    server_error: str
    default_linked: str
    default_unlinked: str


_AR = AlexaCopy(
    reprompt_link="قل: اربط، ثم الرمز من ستة أرقام كما في اللوحة.",
    reprompt_quiz="قل: ابدأ الاختبار.",
    reprompt_answer="ما إجابتك؟ قل: أ، أو ب، أو ج.",
    reprompt_answer_free="قل: واحد، اثنان، ثلاثة. أو الأول، الثاني، الثالث.",
    welcome=(
        "مرحباً بك في أثيريا، برنامجك التدريبي للأطفال. "
        "لتبدأ، قل: اربط، ثم رمز الطفل من ستة أرقام. "
        "ستجده في لوحة ولي الأمر أو عند الأخصائي."
    ),
    link_success=(
        "تم الربط بنجاح.{child} "
        "الآن يمكنك البدء ببرنامجك التدريبي. قل: ابدأ الاختبار."
    ),
    help_linked=(
        "لبدء البرنامج التدريبي قل: ابدأ الاختبار. "
        "أجب بأ أو ب أو ج. عند الانتهاء قل: أنهِ الاختبار."
    ),
    help_during_quiz=(
        "أجب على السؤال الحالي بأ أو ب أو ج. "
        "إذا لم أفهم، سأطلب منك إعادة الإجابة. للإنهاء قل: أنهِ الاختبار."
    ),
    stop="حسناً، توقفنا هنا. إلى اللقاء!",
    fallback_try_quiz="لتبدأ البرنامج قل: ابدأ الاختبار.",
    link_need_child=(
        "من فضلك اربط الطفل أولاً. قل: اربط، ثم الرمز من اللوحة."
    ),
    link_no_code=(
        "لم أفهم الرمز. قل: اربط، ثم ستة أرقام متتابعة بدون مسافة، "
        "مثل: اربط 469573."
    ),
    link_not_found=(
        "لم أجد الرمز {code}. تأكد أنه نفس الرمز في لوحة أثيريا، "
        "وانطقه رقماً رقماً."
    ),
    link_not_found_short=(
        "لم أجد الرمز {code}. انسخه من اللوحة كما هو، مثال: اربط 469573."
    ),
    quiz_intro="ممتاز! لنبدأ البرنامج التدريبي. ",
    quiz_no_questions=(
        "لا توجد أسئلة جاهزة بعد. اطلب من الأخصائي تعيين برنامج تدريبي."
    ),
    quiz_end_dashboard=(
        " يمكن لولي الأمر أو الأخصائي متابعة تقدمك على موقع أثيريا."
    ),
    server_error="عذراً، حدث خطأ. حاول مرة أخرى بعد قليل.",
    default_linked="قل: ابدأ الاختبار لبدء البرنامج التدريبي.",
    default_unlinked=(
        "مرحباً بك في أثيريا. لتبدأ البرنامج التدريبي، قل: اربط، "
        "ثم رمز الطفل من ستة أرقام."
    ),
)

_EN = AlexaCopy(
    reprompt_link="Say: link, then the six-digit code from the dashboard.",
    reprompt_quiz="Say: start the quiz.",
    reprompt_answer="What's your answer? Say A, B, or C.",
    reprompt_answer_free="Say your answer again clearly.",
    welcome=(
        "Welcome to Atheeria, the training platform for children. "
        "Please enter the child's code: say link, then the six-digit code. "
        "You will find it on the parent or specialist dashboard."
    ),
    link_success=(
        "Linked successfully.{child} "
        "You can now start your training program. Say: start the quiz."
    ),
    help_linked=(
        "To begin, say: start the quiz. Answer with A, B, or C. "
        "When you're done, say: end quiz."
    ),
    help_during_quiz=(
        "Answer the current question with A, B, or C. "
        "If I don't understand, I'll ask you to repeat. To finish, say: end quiz."
    ),
    stop="Quiz stopped. Goodbye!",
    fallback_try_quiz="Say: start the quiz to begin your training program.",
    link_need_child="Please link the child first. Say: link, then the code from the dashboard.",
    link_no_code=(
        "I didn't catch the code. Say or type: link, then six digits with no spaces, "
        "for example: link 469573."
    ),
    link_not_found=(
        "I couldn't find code {code}. Check the same code on the Atheeria dashboard "
        "and that your English skill points to the Render eduvox-alexa endpoint."
    ),
    link_not_found_short=(
        "I couldn't find code {code}. Copy it from the dashboard as-is, "
        "for example: link 469573."
    ),
    quiz_intro="Great, let's start your training program. ",
    quiz_no_questions=(
        "There are no ready questions yet. Ask your specialist to assign a ready program."
    ),
    quiz_end_dashboard=" Well done! Check the dashboard on the website to see your progress.",
    server_error="A server error occurred. Please try again.",
    default_linked="Say: start the quiz to begin your training program.",
    default_unlinked=(
        "Welcome to Atheeria. Say link, then the child's six-digit code from the dashboard."
    ),
)

_COPY: dict[str, AlexaCopy] = {"ar": _AR, "en": _EN}


def detect_alexa_locale(payload: dict) -> AlexaLocale:
    req = payload.get("request") or {}
    locale = (req.get("locale") or "").strip().lower()
    if not locale:
        ctx = payload.get("context") or {}
        sys_ = ctx.get("System") or {}
        locale = (sys_.get("device") or {}).get("locale") or ""
        locale = str(locale).strip().lower()
    if locale.startswith("en"):
        return "en"
    return "ar"


def get_alexa_copy(locale: AlexaLocale) -> AlexaCopy:
    return _COPY.get(locale, _AR)


def link_success_speech(copy: AlexaCopy, patient_name: str | None) -> str:
    if patient_name:
        if copy is _EN:
            child = f" Linked to {patient_name}."
        else:
            child = f" أهلاً {patient_name}!"
    else:
        child = ""
    return copy.link_success.format(child=child)


def quiz_start_intro(copy: AlexaCopy, locale: AlexaLocale, patient_name: str | None) -> str:
    if locale == "en":
        if patient_name:
            return f"Great, {patient_name}! Let's start your training program. "
        return copy.quiz_intro
    if patient_name:
        return f"ممتاز يا {patient_name}! لنبدأ البرنامج التدريبي. "
    return copy.quiz_intro


def _add_speech_part(parts: list[str], val: object) -> None:
    if val is None:
        return
    if isinstance(val, str):
        s = val.strip()
        if s and s not in parts:
            parts.append(s)
        return
    if isinstance(val, dict):
        for key in ("value", "name", "text", "input", "utterance"):
            inner = val.get(key)
            if isinstance(inner, str) and inner.strip():
                _add_speech_part(parts, inner.strip())


def _walk_slot_for_speech(slot: dict, parts: list[str]) -> None:
    if not isinstance(slot, dict):
        return
    _add_speech_part(parts, slot.get("value"))
    original = slot.get("originalValue")
    if isinstance(original, str):
        _add_speech_part(parts, original)
    elif isinstance(original, dict):
        _add_speech_part(parts, original.get("value"))
    slot_value = slot.get("slotValue")
    if isinstance(slot_value, dict):
        _add_speech_part(parts, slot_value.get("value"))
    if slot.get("resolutions"):
        try:
            per_auth = slot["resolutions"].get("resolutionsPerAuthority", [])
            for authority in per_auth:
                for item in authority.get("values", []):
                    value = item.get("value", {})
                    _add_speech_part(parts, value.get("name"))
                    _add_speech_part(parts, value.get("id"))
        except (KeyError, IndexError, TypeError):
            pass


def collect_speech_candidates(intent: dict, payload: dict | None) -> list[str]:
    """All strings Alexa might have captured as the user's words."""
    parts: list[str] = []
    if payload:
        req = payload.get("request") or {}
        for key in (
            "input",
            "query",
            "utterance",
            "inputTranscript",
            "transcript",
            "rawInput",
            "phrase",
        ):
            val = req.get(key)
            if val and isinstance(val, str):
                _add_speech_part(parts, val)
        intent_in_req = req.get("intent") or {}
        if isinstance(intent_in_req, dict):
            for slot in (intent_in_req.get("slots") or {}).values():
                _walk_slot_for_speech(slot, parts)
    slots = intent.get("slots", {}) or {}
    for slot in slots.values():
        _walk_slot_for_speech(slot, parts)
    return parts


def extract_user_utterance(intent: dict, payload: dict | None) -> str:
    """Best single guess of spoken/typed user text."""
    parts = collect_speech_candidates(intent, payload)
    if not parts:
        return ""
    return max(parts, key=len)


def user_utterance_blob(intent: dict, payload: dict | None, locale: AlexaLocale) -> str:
    raw = extract_user_utterance(intent, payload)
    if not raw:
        return ""
    if locale == "en":
        return raw.lower()
    return normalize_arabic_speech(raw)


def request_text_blob(intent: dict, payload: dict | None, locale: AlexaLocale) -> str:
    parts: list[str] = []
    user = extract_user_utterance(intent, payload)
    if user:
        parts.append(user)
    parts.append(json.dumps(intent, ensure_ascii=False))
    raw = " ".join(parts)
    if locale == "en":
        return raw.lower()
    return normalize_arabic_speech(raw)


def wants_end_quiz(blob: str, locale: AlexaLocale) -> bool:
    if not blob:
        return False
    if locale == "en":
        if re.search(r"\b(start|begin|open)\b", blob) and re.search(r"\b(quiz|test|training)\b", blob):
            return False
        return bool(re.search(r"\b(end|finish|stop)\b.*\b(quiz|test)\b|\bend quiz\b|\bfinish quiz\b", blob))
    return bool(
        re.search(r"(انه|انهاء|انهي|انته|انهِ|انها|end\s*quiz|finish)", blob)
        and not re.search(r"^(ابد|ابدا|ابدأ|بدا|بدء)", blob)
    )


def wants_start_quiz(blob: str, locale: AlexaLocale) -> bool:
    if not blob:
        return False
    if wants_end_quiz(blob, locale):
        return False
    if locale == "en":
        return bool(
            re.search(
                r"\b(start|begin|open)\s+(the\s+)?(quiz|test|training(\s+program)?)\b|"
                r"\bstart\s+the\s+quiz\b|\bbegin\s+the\s+quiz\b",
                blob,
            )
        )
    return bool(
        re.search(
            r"(ابدأ\s+الاختبار|ابدا\s+الاختبار|ابدأ\s+البرنامج|ابدا\s+البرنامج|"
            r"ابدأ\s+البرنامج\s+التدريبي|ابدا\s+البرنامج\s+التدريبي|"
            r"ابد\s+الاختبار|ابدا\s+الاختبار|بدا\s+الاختبار|بدء\s+الاختبار|"
            r"افتح\s+البرنامج|^\s*(ابدأ|ابدا|ابدئ)\s*$|start\s+quiz)",
            blob,
        )
    )


def wants_link(blob: str, locale: AlexaLocale) -> bool:
    if not blob:
        return False
    if locale == "en":
        return bool(re.search(r"\b(link|code)\b", blob, re.IGNORECASE))
    return bool(re.search(r"(اربط|ربط|كود|الرمز|رمز)", blob))


def skill_open_speech(
    copy: AlexaCopy,
    locale: AlexaLocale,
    *,
    linked: bool,
    patient_name: str | None,
) -> tuple[str, str]:
    """Greeting when the skill opens or the user re-invokes it."""
    if not linked:
        return copy.welcome, copy.reprompt_link
    if patient_name:
        if locale == "en":
            return (
                f"Welcome back! You're linked to {patient_name}. Say: start the quiz.",
                copy.reprompt_quiz,
            )
        return (
            f"أهلاً بعودتك يا {patient_name}! قل: ابدأ الاختبار لبدء البرنامج التدريبي.",
            copy.reprompt_quiz,
        )
    return copy.help_linked, copy.reprompt_quiz


def wants_skill_reopen(blob: str, locale: AlexaLocale) -> bool:
    """User is opening the skill again, not answering a pending link-code prompt."""
    if not blob:
        return False
    if locale == "en":
        return bool(
            re.search(
                r"\b(open|start|launch|begin)\b.*\b(atheeria|atheria)\b|"
                r"\b(atheeria|atheria)\b.*\b(skill|program)\b|"
                r"^atheeria$|^atheria$",
                blob,
            )
        )
    return bool(re.search(r"(افتح|شغل|ابدأ|ابدئ|أثيريا|اثيريا|مدرسة)", blob))


def should_reset_link_to_welcome(blob: str, locale: AlexaLocale) -> bool:
    """Reset only on explicit skill-open phrases — not on empty device transcripts."""
    if wants_skill_reopen(blob, locale) or wants_training_program(blob, locale):
        return True
    if wants_link(blob, locale) or looks_like_link_code_attempt(blob):
        return False
    if not blob:
        return False
    return True


def wants_training_program(blob: str, locale: AlexaLocale) -> bool:
    if locale == "en":
        return bool(blob and re.search(r"\b(training|program|atheeria|attheeria)\b", blob))
    return bool(blob and re.search(r"(برنامج|تدريب|اثيريا|أثيريا|افتح)", blob))


def combined_speech_blob(user_blob: str, utterance_blob: str) -> str:
    """Best available transcript for intent disambiguation (device often omits user_blob)."""
    user = (user_blob or "").strip()
    if user:
        return user
    return (utterance_blob or "").strip()


def resolve_effective_intent(
    intent_name: str,
    blob: str,
    has_active_quiz: bool,
    locale: AlexaLocale,
    *,
    utterance_blob: str = "",
) -> str:
    speech = combined_speech_blob(blob, utterance_blob)

    if intent_name == "StartQuizIntent" and not has_active_quiz:
        return "StartQuizIntent"

    # Alexa often misroutes «ابدأ الاختبار» as EndQuizIntent, especially on devices.
    if intent_name == "EndQuizIntent" and not has_active_quiz:
        if wants_end_quiz(speech, locale):
            return "EndQuizIntent"
        return "StartQuizIntent"

    if wants_start_quiz(speech, locale) and not has_active_quiz:
        if intent_name in (
            "EndQuizIntent",
            "AMAZON.FallbackIntent",
            "AMAZON.HelpIntent",
        ):
            return "StartQuizIntent"
    if wants_end_quiz(speech, locale) and has_active_quiz:
        return "EndQuizIntent"
    if intent_name == "AMAZON.FallbackIntent" and (
        wants_link(speech, locale) or looks_like_link_code_attempt(speech)
    ):
        return "LinkPatientIntent"
    return intent_name


# Quiz runtime messages (used by QuizService)
@dataclass(frozen=True)
class QuizRuntimeCopy:
    no_active: str
    no_question: str
    bad_answer: str
    bad_answer_repeat: str
    correct: str
    wrong: str
    no_more: str
    no_more_reprompt: str
    end_no_quiz: str
    end_score: str
    end_weak: str
    end_perfect: str
    goodbye: str


_QUIZ_AR = QuizRuntimeCopy(
    no_active="لا يوجد برنامج نشط. قل: ابدأ الاختبار.",
    no_question="لا يوجد سؤال الآن. قل: ابدأ الاختبار.",
    bad_answer="لم أفهم إجابتك. أعد قول الإجابة: أ، أو ب، أو ج.",
    bad_answer_repeat="لم أفهم إجابتك. أعد الإجابة بوضوح. ",
    correct="أحسنت! إجابة صحيحة.",
    wrong="لا بأس. الإجابة الصحيحة هي {letter}.",
    no_more=" انتهت الأسئلة. قل: أنهِ الاختبار لسماع نتيجتك.",
    no_more_reprompt="قل: أنهِ الاختبار.",
    end_no_quiz="لا يوجد برنامج لإنهائه. قل: ابدأ الاختبار.",
    end_score="انتهى البرنامج التدريبي. نتيجتك {score} من {total}.",
    end_weak=" يمكنك التمرّن أكثر على: {topics}.",
    end_perfect=" أحسنت! أجبت على كل الأسئلة بشكل صحيح.",
    goodbye=" إلى اللقاء!",
)

_QUIZ_EN = QuizRuntimeCopy(
    no_active="There is no active quiz. Say: start the quiz.",
    no_question="No question loaded. Say: start the quiz.",
    bad_answer="I didn't understand your answer. Please say A, B, or C again.",
    bad_answer_repeat="I didn't catch that. Say your answer again. ",
    correct="Correct!",
    wrong="Wrong. The correct answer is {letter}.",
    no_more=" No more questions. Say: end quiz to hear your score.",
    no_more_reprompt="Say: end quiz to hear your score.",
    end_no_quiz="There is no quiz to finish. Say: start the quiz.",
    end_score="Quiz complete. Your score is {score} out of {total}, that's {pct} percent.",
    end_weak=" You may want more practice on: {topics}.",
    end_perfect=" Great job! You answered every question correctly.",
    goodbye=" Goodbye!",
)

_QUIZ_COPY: dict[str, QuizRuntimeCopy] = {"ar": _QUIZ_AR, "en": _QUIZ_EN}


def get_quiz_copy(locale: AlexaLocale) -> QuizRuntimeCopy:
    return _QUIZ_COPY.get(locale, _QUIZ_AR)


def spoken_option_letter(letter: str, locale: AlexaLocale) -> str:
    if locale == "en":
        return letter.upper()
    return {"A": "أ", "B": "ب", "C": "ج"}.get(letter.upper(), letter)


def patient_quiz_errors(locale: AlexaLocale) -> dict[str, str]:
    if locale == "en":
        return {
            "not_linked": "Say: link, then the child's code first.",
            "no_patient": "I couldn't find this child. Link the code again.",
            "no_program": "No training program is assigned. Ask your specialist to assign one.",
            "no_questions": "The assigned program has no ready questions yet.",
            "load_failed": "Couldn't load the quiz right now. Try again later.",
        }
    return {
        "not_linked": "قل: اربط، ثم انطق رمز الطفل أولاً.",
        "no_patient": "لم أجد هذا الطفل. اربط الرمز مرة أخرى.",
        "no_program": "لا يوجد برنامج تدريبي معيّن لهذا الطفل. اطلب من المختص تعيين برنامج.",
        "no_questions": "البرنامج المعيّن لا يحتوي أسئلة جاهزة بعد. اطلب من المختص تجهيز البرنامج.",
        "load_failed": "تعذّر تحميل الاختبار الآن. حاول مرة أخرى لاحقاً.",
    }
