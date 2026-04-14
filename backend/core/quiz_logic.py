"""
Quiz logic: question generation, adaptive selection, cache, sessions, services.
"""
import json
import re
import random
from pathlib import Path
from typing import List, Dict, Any, Set


# ========== Question Generation (Groq) ==========
ALEXA_INTROS_FIRST = ["Here's your question. ", "Question: ", "Let's start. "]
ALEXA_INTROS_NEXT = ["Next question. ", "Here's the next one. "]


class QuizGenerator:
    """Generate MCQ questions from text via the Groq API."""

    def __init__(self, api_key: str, model: str = "llama-3.3-70b-versatile", timeout_seconds: float = 25.0):
        self._api_key = api_key
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._client = None

    def _get_client(self):
        if self._client is None:
            from groq import Groq
            self._client = Groq(api_key=self._api_key, timeout=self._timeout_seconds)
        return self._client

    def generate(self, context: str) -> Dict[str, Any] | None:
        prompt = f"""
Context: {context[:800]}
Task: Create exactly ONE short MCQ (under 12 words). Simple English.
Format:
Question: [Short question]
A) [Option]
B) [Option]
C) [Option]
Correct: [A or B or C]
"""
        try:
            client = self._get_client()
            completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self._model,
                temperature=0.8,
            )
            text = completion.choices[0].message.content or ""
            match = re.search(r"Correct:\s*([A-C])", text, re.IGNORECASE)
            if not match:
                return None
            correct = match.group(1).strip().upper()
            clean = re.sub(r"Correct:.*", "", text, flags=re.DOTALL).strip()
            if "main goal" in clean.lower() or "purpose of" in clean.lower():
                return None
            options = self._parse_options(clean)
            intro = random.choice(ALEXA_INTROS_FIRST)
            return {"question": f"{intro}{clean}", "question_body": clean, "options": options, "correct": correct}
        except Exception:
            return None

    def _parse_options(self, text: str) -> Dict[str, str]:
        options = {}
        for letter in "ABC":
            m = re.search(rf"{letter}\)\s*(.+?)(?=\s+[A-C]\)|$)", text, re.DOTALL)
            options[letter] = f"{letter}) " + (m.group(1).strip() if m else "Option " + letter)
        return options


# ========== Adaptive Question Selector ==========
class QuizSelector:
    """Prioritise weak chunks, then least-asked questions."""

    def __init__(self, threshold: float = 0.6):
        self.threshold = threshold

    def get_weak_chunk_ids(self, questions: List[Dict]) -> List[int]:
        weak = set()
        for q in questions:
            asked = q.get("times_asked", 0)
            correct = q.get("times_correct", 0)
            if asked > 0 and (correct / asked) < self.threshold:
                weak.add(q["chunk_id"])
        return list(weak)

    def select_next(
        self,
        questions: List[Dict],
        weak_chunk_ids: List[int] | None = None,
        exclude_chunk_id: int | None = None,
        used_question_indices: Set[int] | None = None,
    ) -> Dict | None:
        if not questions:
            return None

        used = used_question_indices or set()

        # Build pool: exclude questions already used in this session
        pool = [
            q for q in questions
            if id(q) not in used and q.get("chunk_id") != exclude_chunk_id
        ]
        # If all questions were used, allow repeats but still avoid the last chunk
        if not pool:
            pool = [q for q in questions if q.get("chunk_id") != exclude_chunk_id]
        if not pool:
            pool = list(questions)

        weak = weak_chunk_ids or self.get_weak_chunk_ids(questions)

        # Prefer weak chunks that haven't been used yet in this session
        if weak:
            candidates = [q for q in pool if q.get("chunk_id") in weak]
            if candidates:
                return random.choice(candidates)

        # Fallback: least-asked questions from the unused pool
        min_asked = min(q.get("times_asked", 0) for q in pool)
        candidates = [q for q in pool if q.get("times_asked", 0) == min_asked]
        return random.choice(candidates) if candidates else random.choice(pool)


# ========== Question Cache ==========
class QuestionCache:
    """Load / save questions and update per-question statistics."""

    def __init__(self, path: Path | None = None):
        self._path = path
        self._questions: List[Dict] = []

    def load(self, path: Path | None = None) -> List[Dict]:
        p = path or self._path
        if not p or not p.exists():
            self._questions = []
            return self._questions
        with open(p, "r", encoding="utf-8") as f:
            self._questions = json.load(f)
        return self._questions

    def save(self, path: Path | None = None) -> None:
        p = path or self._path
        if not p:
            return
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(self._questions, f, indent=2, ensure_ascii=False)

    def get_all(self) -> List[Dict]:
        return list(self._questions)

    def update_stats(self, question: Dict, user_answer: str) -> None:
        question["times_asked"] = question.get("times_asked", 0) + 1
        if (user_answer or "").strip().upper() == question.get("correct", ""):
            question["times_correct"] = question.get("times_correct", 0) + 1

    def format_for_speech(self, q: Dict, first_question: bool = False, is_next: bool = False) -> str:
        question = q.get("question", "").strip()
        if not question:
            return ""

        # Strip any existing intro prefix so we never double them
        all_intros = ALEXA_INTROS_FIRST + ALEXA_INTROS_NEXT
        for intro in all_intros:
            if question.lower().startswith(intro.lower()):
                question = question[len(intro):].strip()
                break

        # Also strip duplicate "Question: " prefix (e.g. "Question: Question: ...")
        while question.lower().startswith("question:"):
            question = question[len("question:"):].strip()

        # Prepend the appropriate intro
        if first_question:
            question = random.choice(ALEXA_INTROS_FIRST) + question
        elif is_next:
            question = random.choice(ALEXA_INTROS_NEXT) + question

        if "A)" in question and "B)" in question:
            return question
        opts = q.get("options", {})
        parts = [question]
        for k in ["A", "B", "C"]:
            if k in opts:
                parts.append(opts[k])
        return " ".join(parts)


# ========== Session Store ==========
class SessionStore:
    """In-memory session storage, keyed by userId for stable sessions across requests."""

    def __init__(self):
        self._sessions: Dict[str, Dict] = {}

    def resolve_key(self, session_id: str, user_id: str) -> str:
        """Use userId when available to maintain session across Alexa turn boundaries."""
        return (user_id or "").strip() or session_id

    def get(self, session_id: str) -> Dict | None:
        return self._sessions.get(session_id)

    def set(
        self,
        session_id: str,
        questions: List[Dict],
        question_pool: List[Dict] | None = None,
        score: int = 0,
        wrong_topics: List[str] | None = None,
    ) -> None:
        self._sessions[session_id] = {
            "questions": list(questions),
            "question_pool": list(question_pool or questions),
            "current_index": 0,
            "score": score,
            "wrong_topics": list(wrong_topics or []),
            "used_ids": {id(q) for q in questions},
        }

    def append_question(self, session_id: str, question: Dict) -> None:
        s = self._sessions.get(session_id)
        if s:
            s["questions"].append(question)
            s["current_index"] = len(s["questions"]) - 1
            s.setdefault("used_ids", set()).add(id(question))

    def get_used_ids(self, session_id: str) -> Set[int]:
        s = self._sessions.get(session_id)
        return s.get("used_ids", set()) if s else set()

    def get_question_pool(self, session_id: str) -> List[Dict]:
        s = self._sessions.get(session_id)
        return list(s.get("question_pool", [])) if s else []

    def add_wrong_topic(self, session_id: str, topic: str) -> None:
        s = self._sessions.get(session_id)
        if s:
            s["wrong_topics"].append(topic)

    def increment_score(self, session_id: str) -> None:
        s = self._sessions.get(session_id)
        if s:
            s["score"] = s.get("score", 0) + 1

    def get_current_question(self, session_id: str) -> Dict | None:
        s = self._sessions.get(session_id)
        if not s or not s["questions"]:
            return None
        idx = s.get("current_index", 0)
        if 0 <= idx < len(s["questions"]):
            return s["questions"][idx]
        return None

    def pop(self, session_id: str) -> Dict | None:
        return self._sessions.pop(session_id, None)

    def clear_if_new(self, session_id: str, is_new: bool) -> None:
        if is_new and session_id in self._sessions:
            self._sessions.pop(session_id, None)


# ========== Quiz Service ==========
class QuizService:
    """Orchestrates: start quiz, answer, end quiz."""

    def __init__(self, cache: QuestionCache, session_store: SessionStore, selector: QuizSelector):
        self._cache = cache
        self._sessions = session_store
        self._selector = selector

    def _reload_questions(self) -> List[Dict]:
        return self._cache.load()

    def start_quiz(self, session_id: str, questions: List[Dict] | None = None) -> str | None:
        questions = list(questions) if questions is not None else self._reload_questions()
        if not questions:
            return None
        q = self._selector.select_next(questions)
        if not q:
            return None
        self._sessions.set(session_id, questions=[q], question_pool=questions, score=0, wrong_topics=[])
        return self._cache.format_for_speech(q, first_question=True)

    def answer_and_next(self, session_id: str, user_answer: str) -> tuple[str, bool]:
        if not self._sessions.get(session_id):
            return "No active quiz. Say give me a quiz to start.", False
        current = self._sessions.get_current_question(session_id)
        if not current:
            return "No question. Say give me a quiz.", False
        correct = (current.get("correct") or "").strip().upper()
        user = (user_answer or "").strip().upper()[:1]
        if user == correct:
            self._sessions.increment_score(session_id)
            feedback = "Correct!"
        else:
            self._sessions.add_wrong_topic(session_id, f"Chunk {current.get('chunk_id', '?')}")
            feedback = f"Wrong. The correct answer is {correct}."
        self._cache.update_stats(current, user_answer)
        questions = self._sessions.get_question_pool(session_id) or self._reload_questions()
        weak = self._selector.get_weak_chunk_ids(questions)
        current_chunk = current.get("chunk_id")
        used_ids = self._sessions.get_used_ids(session_id)
        next_q = self._selector.select_next(
            questions, weak,
            exclude_chunk_id=current_chunk,
            used_question_indices=used_ids,
        )
        if not next_q:
            return feedback + " No more questions.", False
        self._sessions.append_question(session_id, next_q)
        next_text = self._cache.format_for_speech(next_q, first_question=False, is_next=True)
        return f"{feedback} {next_text}", False

    def end_quiz(self, session_id: str) -> tuple[str, bool, dict | None]:
        """
        Returns (speech_text, end_session, session_snapshot).
        The snapshot must be used by the caller to persist results
        BEFORE the session is cleared from memory.
        """
        session = self._sessions.get(session_id)
        if not session:
            return "There is no active quiz to end. Say give me a quiz to start.", True, None
        # Take a snapshot before popping
        snapshot = {
            "score": session.get("score", 0),
            "questions": list(session.get("questions", [])),
            "wrong_topics": list(session.get("wrong_topics", [])),
            "patient_id": session.get("patient_id"),
        }
        self._sessions.pop(session_id)
        score = snapshot["score"]
        total = len(snapshot["questions"])
        pct = round((score / max(1, total)) * 100)
        wrong = sorted(set(snapshot["wrong_topics"]))
        if wrong:
            weak_text = f" You need more practice on: {', '.join(wrong)}."
        else:
            weak_text = " Great job! You answered all questions correctly."
        return f"Quiz finished. Your score: {score} out of {total}, {pct} percent.{weak_text} Goodbye!", True, snapshot


# ========== Stats Service (Dashboard) ==========
class StatsService:
    """Compute totals, accuracy, and weak topics from the question cache."""

    def __init__(self, cache: QuestionCache):
        self._cache = cache

    def get_global_stats(self) -> Dict:
        questions = self._cache.get_all()
        total_q = len(questions)
        total_asked = sum(q.get("times_asked", 0) for q in questions)
        total_correct = sum(q.get("times_correct", 0) for q in questions)
        accuracy = round((total_correct / total_asked) * 100, 1) if total_asked else 0
        return {
            "total_questions": total_q,
            "total_asked": total_asked,
            "total_correct": total_correct,
            "accuracy": accuracy,
        }

    def get_weak_topics(self, limit: int = 5) -> List[Dict]:
        questions = self._cache.get_all()
        with_acc = []
        for q in questions:
            asked = q.get("times_asked", 0)
            correct = q.get("times_correct", 0)
            acc = (correct / asked * 100) if asked else 0
            with_acc.append({**q, "accuracy_pct": round(acc, 1)})
        return sorted(with_acc, key=lambda x: x["accuracy_pct"])[:limit]
