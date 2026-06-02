"""Scripted «مغامرة النجوم» training flow for Alexa (ages 6–8, voice answers)."""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from backend.core.alexa_codes import canonical_arabic_answer, normalize_arabic_speech
from backend.core.quiz_logic import normalize_mcq_letter

logger = logging.getLogger("AlexaQuiz.Adventure")

ADVENTURE_PREFIX = "ADVENTURE:"
ADVENTURE_ATTR_KEY = "atheeria_adventure"

_READY_YES = frozenset(
    normalize_arabic_speech(w)
    for w in (
        "نعم",
        "أيوه",
        "ايوه",
        "ايه",
        "أيه",
        "جاهز",
        "جاهزة",
        "مستعد",
        "مستعدة",
        "يلا",
        "يلّا",
        "تمام",
        "اه",
        "آه",
        "اهه",
        "اوكي",
        "أوكي",
        "اجل",
        "أجل",
        "طبعا",
        "طبعاً",
        "ok",
        "okay",
        "yes",
        "yeah",
    )
)


def adventure_chunk(
    order: int,
    step_type: str,
    *,
    stage_title: str = "",
    accepted: list[str] | None = None,
    counts_star: bool = False,
    success_feedback: str = "",
) -> str:
    meta: dict[str, Any] = {
        "o": order,
        "t": step_type,
        "star": counts_star,
    }
    if stage_title:
        meta["st"] = stage_title
    if accepted:
        meta["a"] = accepted
    if success_feedback:
        meta["ok"] = success_feedback
    return ADVENTURE_PREFIX + json.dumps(meta, ensure_ascii=False)


def parse_adventure_meta(chunk_text: str) -> dict[str, Any]:
    if not chunk_text or not chunk_text.startswith(ADVENTURE_PREFIX):
        return {}
    try:
        return json.loads(chunk_text[len(ADVENTURE_PREFIX) :])
    except (json.JSONDecodeError, TypeError):
        return {}


def is_adventure_program(questions: list[dict]) -> bool:
    return any((q.get("chunk_text") or "").startswith(ADVENTURE_PREFIX) for q in questions)


def adventure_steps_from_questions(questions: list[dict]) -> list[dict]:
    steps: list[dict] = []
    for q in questions:
        meta = parse_adventure_meta(q.get("chunk_text") or "")
        if not meta:
            continue
        enriched = {**q, "_meta": meta}
        if meta.get("ok"):
            enriched["success_feedback"] = meta["ok"]
        steps.append(enriched)
    steps.sort(key=lambda s: int(s["_meta"].get("o", 0)))
    return steps


def _norm(text: str) -> str:
    return normalize_arabic_speech((text or "").strip())


def _clean_answer_phrase(blob: str) -> str:
    n = _norm(blob)
    n = re.sub(
        r"^(الجواب|جواب|اجابتي|إجابتي|اجابة|إجابة|قل|قول|انا|أنا)\s+",
        "",
        n,
    ).strip()
    return n


def _compact_answer(blob: str) -> str:
    """ك.ل.ب or ك ل ب → كلب for matching."""
    return canonical_arabic_answer(_clean_answer_phrase(blob))


def _levenshtein(a: str, b: str) -> int:
    if len(a) < len(b):
        return _levenshtein(b, a)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (ca != cb)))
        prev = curr
    return prev[-1]


def _word_match(blob: str, word: str) -> bool:
    blob_compact = _compact_answer(blob)
    word_compact = _compact_answer(word)
    blob_norm = _clean_answer_phrase(blob)
    word_norm = _clean_answer_phrase(word)
    if not blob_compact and not blob_norm:
        return False
    if not word_compact and not word_norm:
        return False
    if blob_compact and word_compact and blob_compact == word_compact:
        return True
    if blob_norm == word_norm:
        return True
    blob_tokens = blob_norm.split()
    if word_norm in blob_tokens:
        return True
    if word_norm in blob_norm or blob_norm in word_norm:
        return True
    if blob_compact and word_compact:
        if blob_compact.startswith("ال") and blob_compact[2:] == word_compact:
            return True
        if word_compact.startswith("ال") and word_compact[2:] == blob_compact:
            return True
        if len(word_compact) >= 3 and len(blob_compact) >= 3:
            if _levenshtein(blob_compact, word_compact) <= 1:
                return True
    return False


def _option_label(opt: str) -> str:
    s = (opt or "").strip()
    s = re.sub(r"^[أبجABCabc]\)\s*", "", s).strip()
    return _norm(s)


def _accepted_for_step(step: dict) -> list[str]:
    meta = step.get("_meta") or {}
    words = [_norm(w) for w in meta.get("a") or [] if w]
    opts = step.get("options") or {}
    correct = (step.get("correct") or "").strip().upper()
    if correct in opts:
        label = _option_label(opts[correct])
        if label and label not in words:
            words.append(label)
    for key in ("A", "B", "C"):
        if key in opts:
            label = _option_label(opts[key])
            if label and label not in words:
                words.append(label)
    return [w for w in words if w]


def _matches_readiness(blob: str) -> bool:
    n = _norm(blob)
    if not n:
        return False
    if n in _READY_YES:
        return True
    if re.search(r"(^|[\s،,.؟!])(نعم|ايوه|اجل|جاهز|مستعد|اه|تمام|اوكي)([\s،,.؟!]|$)", n):
        return True
    if re.match(r"^ن+ع?م+\.?$", n):
        return True
    return any(token in n for token in _READY_YES if len(token) >= 2)


def is_adventure_readiness_step(session: dict | None) -> bool:
    if not session or session.get("mode") != "adventure":
        return False
    steps = session.get("adventure_steps") or []
    idx = int(session.get("step_index", 0))
    if idx >= len(steps):
        return False
    return (steps[idx].get("_meta") or {}).get("t") == "readiness"


def infer_yes_from_intent(intent_name: str) -> str | None:
    if intent_name in (
        "AMAZON.YesIntent",
        "AMAZON.ConfirmIntent",
        "AMAZON.AffirmativeIntent",
    ):
        return "نعم"
    return None


def match_adventure_answer(user_text: str, step: dict) -> bool:
    blob = _clean_answer_phrase(user_text)
    if not blob:
        return False
    step_type = (step.get("_meta") or {}).get("t", "question")
    if step_type == "readiness":
        return _matches_readiness(user_text)
    accepted = _accepted_for_step(step)
    for word in accepted:
        if word and _word_match(blob, word):
            return True
    letter = normalize_mcq_letter(user_text)
    correct = (step.get("correct") or "").strip().upper()
    if letter and correct and letter == correct:
        return True
    digits = re.sub(r"\D", "", blob)
    for word in accepted:
        wd = re.sub(r"\D", "", word)
        if wd and digits and wd == digits:
            return True
    return False


def adventure_speech_hint(session: dict | None) -> str:
    """Short reprompt when Amazon sends no slot text (FallbackIntent)."""
    if not session:
        return "قل إجابتك بكلمة واحدة."
    steps = session.get("adventure_steps") or []
    idx = int(session.get("step_index", 0))
    if idx >= len(steps):
        return "قل إجابتك بكلمة واحدة."
    step = steps[idx]
    meta = step.get("_meta") or {}
    if meta.get("t") == "readiness":
        return "قل: نعم، أو جاهز."
    accepted = _accepted_for_step(step)
    if accepted:
        return f"قل كلمة واحدة، مثل: {accepted[0]}."
    return "قل إجابتك بكلمة واحدة."


def pick_speech_for_step(candidates: list[str], step: dict) -> str:
    """Prefer a candidate that matches; else longest non-empty string."""
    for c in candidates:
        if c and match_adventure_answer(c, step):
            return c.strip()
    non_empty = [c.strip() for c in candidates if c and c.strip()]
    if non_empty:
        return max(non_empty, key=len)
    return ""


def export_adventure_session_attributes(session: dict | None) -> dict[str, str] | None:
    if not session or session.get("mode") != "adventure":
        return None
    payload = {
        "mode": "adventure",
        "step_index": int(session.get("step_index", 0)),
        "stars": int(session.get("stars", 0)),
        "max_stars": int(session.get("max_stars", 0)),
        "patient_id": session.get("patient_id"),
        "locale": session.get("locale", "ar"),
    }
    return {ADVENTURE_ATTR_KEY: json.dumps(payload, ensure_ascii=False)}


def restore_adventure_session(
    session_store,
    session_key: str,
    attributes: dict,
    questions: list[dict],
    *,
    patient_id: int | None = None,
    patient_name: str | None = None,
) -> bool:
    raw = (attributes or {}).get(ADVENTURE_ATTR_KEY)
    if not raw:
        return False
    try:
        meta = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return False
    if meta.get("mode") != "adventure":
        return False
    steps = adventure_steps_from_questions(questions)
    if not steps:
        return False
    step_index = int(meta.get("step_index", 0))
    step_index = max(0, min(step_index, len(steps) - 1))
    session_store.set(
        session_key,
        questions=[steps[step_index]],
        question_pool=steps,
        score=int(meta.get("stars", 0)),
        wrong_topics=[],
        locale=meta.get("locale", "ar"),
    )
    s = session_store.get(session_key)
    if not s:
        return False
    s["mode"] = "adventure"
    s["adventure_steps"] = steps
    s["step_index"] = step_index
    s["stars"] = int(meta.get("stars", 0))
    s["max_stars"] = int(meta.get("max_stars", 0)) or sum(
        1 for x in steps if (x.get("_meta") or {}).get("star")
    )
    s["current_index"] = 0
    pid = patient_id or meta.get("patient_id")
    if pid:
        s["patient_id"] = pid
    if patient_name:
        s["patient_name"] = patient_name
    logger.info(
        "Restored adventure session key=%s step=%s stars=%s",
        session_key[:12],
        step_index,
        s.get("stars"),
    )
    return True


def format_step_speech(step: dict, *, patient_name: str | None = None, prefix: str = "") -> str:
    parts: list[str] = []
    if prefix:
        parts.append(prefix.strip() + " ")
    meta = step.get("_meta") or {}
    step_type = meta.get("t", "question")
    if step_type == "question" and meta.get("st"):
        parts.append(f"{meta['st']}. ")
    question = (step.get("question") or "").strip()
    if question:
        parts.append(question)
    if not parts and question:
        return question
    text = "".join(parts)
    if patient_name and step_type == "readiness" and not prefix:
        return f"أهلاً {patient_name}! {text}"
    return text


class AdventureQuizService:
    """Linear scripted session with stars (no MCQ letters spoken)."""

    def __init__(self, session_store):
        self._sessions = session_store

    def _session(self, session_id: str) -> dict | None:
        return self._sessions.get(session_id)

    def start(
        self,
        session_id: str,
        questions: list[dict],
        locale: str = "ar",
        patient_id: int | None = None,
        patient_name: str | None = None,
    ) -> str | None:
        steps = adventure_steps_from_questions(questions)
        if not steps:
            return None
        max_stars = sum(1 for s in steps if (s.get("_meta") or {}).get("star"))
        self._sessions.set(
            session_id,
            questions=[steps[0]],
            question_pool=steps,
            score=0,
            wrong_topics=[],
            locale=locale,
        )
        s = self._sessions.get(session_id)
        if not s:
            return None
        s["mode"] = "adventure"
        s["adventure_steps"] = steps
        s["step_index"] = 0
        s["stars"] = 0
        s["max_stars"] = max_stars
        s["current_index"] = 0
        if patient_id:
            s["patient_id"] = patient_id
        if patient_name:
            s["patient_name"] = patient_name
        return format_step_speech(steps[0], patient_name=patient_name)

    def repeat_current(self, session_id: str) -> tuple[str, bool]:
        s = self._session(session_id)
        if not s or s.get("mode") != "adventure":
            return "لا يوجد برنامج نشط.", False
        steps = s.get("adventure_steps") or []
        idx = s.get("step_index", 0)
        if idx >= len(steps):
            return "انتهت المغامرة.", True
        return (
            "لم أفهم إجابتك. أعد قول إجابتك بوضوح. "
            + format_step_speech(steps[idx]),
            False,
        )

    def answer(
        self, session_id: str, user_text: str
    ) -> tuple[str, bool, dict | None]:
        s = self._session(session_id)
        if not s or s.get("mode") != "adventure":
            return "لا يوجد برنامج نشط. قل: ابدأ الاختبار.", False, None  # noqa: RET504
        steps: list[dict] = s.get("adventure_steps") or []
        idx = int(s.get("step_index", 0))
        if idx >= len(steps):
            snapshot = self._snapshot(s)
            self._sessions.pop(session_id)
            return self._outro(s), True, snapshot
        step = steps[idx]
        if not match_adventure_answer(user_text, step):
            logger.info(
                "Adventure no match step=%s heard=%r compact=%r accepted=%s",
                (step.get("_meta") or {}).get("o"),
                user_text,
                _compact_answer(user_text),
                _accepted_for_step(step),
            )
            speech, _ = self.repeat_current(session_id)
            return speech, False, None

        meta = step.get("_meta") or {}
        step_type = meta.get("t", "question")
        feedback_parts: list[str] = []

        if step_type == "readiness":
            feedback_parts.append("رائع! لنبدأ المغامرة.")
        elif meta.get("star"):
            s["stars"] = int(s.get("stars", 0)) + 1
            on_ok = (step.get("success_feedback") or meta.get("ok") or "").strip()
            feedback_parts.append(on_ok or "ممتاز! حصلت على نجمة.")
        else:
            on_ok = (step.get("success_feedback") or meta.get("ok") or "").strip()
            if on_ok:
                feedback_parts.append(on_ok)

        step["times_asked"] = step.get("times_asked", 0) + 1
        step["times_correct"] = step.get("times_correct", 0) + 1

        next_idx = idx + 1
        s["step_index"] = next_idx
        if next_idx >= len(steps):
            prefix = " ".join(p for p in feedback_parts if p)
            speech = prefix + " " + self._outro(s)
            snapshot = self._snapshot(s)
            self._sessions.pop(session_id)
            return speech.strip(), True, snapshot

        s["questions"] = [steps[next_idx]]
        s["current_index"] = 0
        prefix = " ".join(p for p in feedback_parts if p)
        next_speech = format_step_speech(steps[next_idx], prefix=prefix)
        return next_speech, False, None

    def end_early(self, session_id: str) -> tuple[str, bool, dict | None]:
        s = self._session(session_id)
        if not s or s.get("mode") != "adventure":
            return "لا يوجد برنامج لإنهائه.", True, None
        snapshot = self._snapshot(s)
        self._sessions.pop(session_id)
        return self._outro(s) + " إلى اللقاء!", True, snapshot

    def _outro(self, session: dict) -> str:
        stars = int(session.get("stars", 0))
        total = int(session.get("max_stars", 4)) or 4
        return (
            f"انتهت الجولة. لقد حصلت على {stars} نجوم من أصل {total}. "
            "أنت بطل التركيز اليوم!"
        )

    def _snapshot(self, session: dict) -> dict:
        steps = session.get("adventure_steps") or session.get("question_pool") or []
        answered = steps[: int(session.get("step_index", 0)) + 1]
        return {
            "score": int(session.get("stars", 0)),
            "questions": list(answered),
            "wrong_topics": list(session.get("wrong_topics", [])),
            "patient_id": session.get("patient_id"),
            "adventure": True,
            "max_stars": session.get("max_stars"),
        }
