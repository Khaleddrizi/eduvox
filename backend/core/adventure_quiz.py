"""Scripted «مغامرة النجوم» training flow for Alexa (ages 6–8, voice answers)."""
from __future__ import annotations

import json
import re
from typing import Any

from backend.core.alexa_codes import normalize_arabic_speech
from backend.core.quiz_logic import normalize_mcq_letter

ADVENTURE_PREFIX = "ADVENTURE:"

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
    blob = _norm(user_text)
    if not blob:
        return False
    step_type = (step.get("_meta") or {}).get("t", "question")
    if step_type == "readiness":
        return _matches_readiness(user_text)
    accepted = _accepted_for_step(step)
    for word in accepted:
        if not word:
            continue
        if blob == word or word in blob or blob in word:
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
