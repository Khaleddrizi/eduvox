"""Alexa skill copy and locale helpers (Arabic + English skills, one backend)."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass

from backend.core.alexa_codes import normalize_arabic_speech

AlexaLocale = str  # "ar" | "en"


@dataclass(frozen=True)
class AlexaCopy:
    reprompt_link: str
    reprompt_quiz: str
    reprompt_answer: str
    welcome: str
    link_success: str
    help_linked: str
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
    reprompt_link="قل: اربط، ثم الرمز من ستة أرقام.",
    reprompt_quiz="قل: ابدأ الاختبار.",
    reprompt_answer="ما إجابتك؟ قل: أ، أو ب، أو ج.",
    welcome=(
        "مرحباً بك في أثيريا، منصة البرنامج التدريبي للأطفال. "
        "من فضلك أدخل الرمز الخاص بالطفل: قل «اربط»، ثم الرمز من ستة أرقام. "
        "ستجده في لوحة ولي الأمر أو المختص."
    ),
    link_success=(
        "تم الربط بنجاح.{child} "
        "الآن يمكنك البدء ببرنامجك التدريبي. قل: ابدأ الاختبار."
    ),
    help_linked=(
        "لبدء البرنامج قل: ابدأ الاختبار. أجب بأ أو ب أو ج. "
        "للإنهاء قل: أنهِ الاختبار."
    ),
    stop="تم إيقاف الاختبار. إلى اللقاء!",
    fallback_try_quiz="قل: ابدأ الاختبار لبدء البرنامج التدريبي.",
    link_need_child="من فضلك اربط حساب الطفل أولاً. قل: اربط، ثم الرمز من اللوحة.",
    link_no_code=(
        "لم أفهم الرمز. اكتب أو قل: اربط ثم ستة أرقام بدون مسافات، "
        "مثل: اربط 469573."
    ),
    link_not_found=(
        "لم أجد الرمز {code} في النظام. تأكد أنه نفس الرمز في لوحة أثيريا "
        "وأن مهارة Alexa متصلة بخادم Render (eduvox-alexa)."
    ),
    link_not_found_short="لم أجد الرمز {code}. انسخه من اللوحة كما هو، مثال: اربط 469573.",
    quiz_intro="حسناً، لنبدأ البرنامج التدريبي. ",
    quiz_no_questions="لا توجد أسئلة جاهزة بعد. اطلب من المختص تعيين برنامج جاهز.",
    quiz_end_dashboard=" أحسنت! راجع لوحة المتابعة على الموقع لمعرفة التقدم.",
    server_error="حدث خطأ في الخادم. حاول مرة أخرى.",
    default_linked="قل: ابدأ الاختبار لبدء البرنامج التدريبي.",
    default_unlinked=(
        "مرحباً بك في أثيريا، منصة البرنامج التدريبي للأطفال. "
        "من فضلك أدخل الرمز الخاص بالطفل: قل «اربط»، ثم الرمز من ستة أرقام."
    ),
)

_EN = AlexaCopy(
    reprompt_link="Say: link, then the six-digit code from the dashboard.",
    reprompt_quiz="Say: start the quiz.",
    reprompt_answer="What's your answer? Say A, B, or C.",
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
            child = f" تم ربط حساب {patient_name}."
    else:
        child = ""
    return copy.link_success.format(child=child)


def request_text_blob(intent: dict, payload: dict | None, locale: AlexaLocale) -> str:
    parts: list[str] = []
    if payload:
        req = payload.get("request") or {}
        for key in ("input", "query", "utterance"):
            val = req.get(key)
            if val:
                parts.append(str(val))
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
                r"\b(start|begin|open|resume)\b.*\b(quiz|test|training|program)\b|"
                r"\b(training program|start quiz|begin quiz|open training)\b|"
                r"\bquiz\b|\btraining\b",
                blob,
            )
        )
    return bool(
        re.search(
            r"(ابدأ|ابدا|ابدئ|بدا|بدء|ابد|افتح|start|"
            r"البرنامج|برنامج|تدريب|اختبار|كويز|quiz)",
            blob,
        )
    )


def wants_link(blob: str, locale: AlexaLocale) -> bool:
    if locale == "en":
        return bool(blob and re.search(r"\b(link|code)\b", blob))
    return bool(blob and re.search(r"(اربط|ربط|link|كود|رمز)", blob))


def wants_training_program(blob: str, locale: AlexaLocale) -> bool:
    if locale == "en":
        return bool(blob and re.search(r"\b(training|program|atheeria|attheeria)\b", blob))
    return bool(blob and re.search(r"(برنامج|تدريب|اثيريا|أثيريا|افتح)", blob))


def resolve_effective_intent(
    intent_name: str,
    blob: str,
    has_active_quiz: bool,
    locale: AlexaLocale,
) -> str:
    if wants_start_quiz(blob, locale) and not has_active_quiz:
        if intent_name in (
            "EndQuizIntent",
            "AMAZON.FallbackIntent",
            "AMAZON.HelpIntent",
        ):
            return "StartQuizIntent"
    if wants_end_quiz(blob, locale) and has_active_quiz:
        return "EndQuizIntent"
    if wants_link(blob, locale) and intent_name in ("AMAZON.FallbackIntent",):
        return "LinkPatientIntent"
    return intent_name


# Quiz runtime messages (used by QuizService)
@dataclass(frozen=True)
class QuizRuntimeCopy:
    no_active: str
    no_question: str
    bad_answer: str
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
    no_active="لا يوجد اختبار نشط. قل: ابدأ الاختبار.",
    no_question="لا يوجد سؤال. قل: ابدأ الاختبار.",
    bad_answer="لم أفهم الإجابة. قل: أ، أو ب، أو ج.",
    correct="صحيح!",
    wrong="خطأ. الإجابة الصحيحة هي {letter}.",
    no_more=" لا توجد أسئلة أخرى. قل: أنهِ الاختبار لسماع نتيجتك.",
    no_more_reprompt="قل: أنهِ الاختبار لسماع نتيجتك.",
    end_no_quiz="لا يوجد اختبار لإنهائه. قل: ابدأ الاختبار.",
    end_score="انتهى الاختبار. نتيجتك: {score} من {total}، أي {pct} بالمئة.",
    end_weak=" تحتاج مزيداً من التمرين على: {topics}.",
    end_perfect=" أحسنت! أجبت على كل الأسئلة بشكل صحيح.",
    goodbye=" إلى اللقاء!",
)

_QUIZ_EN = QuizRuntimeCopy(
    no_active="There is no active quiz. Say: start the quiz.",
    no_question="No question loaded. Say: start the quiz.",
    bad_answer="I didn't understand. Say A, B, or C.",
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
