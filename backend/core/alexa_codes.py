"""Alexa child link codes: 6-digit numeric (new) with legacy 8-char hex support."""
from __future__ import annotations

import re
import secrets

ALEXA_LINK_CODE_DIGITS = 6

_ARABIC_INDIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")

_AR_ONES: dict[str, int] = {
    "صفر": 0,
    "زيرو": 0,
    "واحد": 1,
    "واحدة": 1,
    "وحدة": 1,
    "حدة": 1,
    "اثنان": 2,
    "اثنين": 2,
    "ثنين": 2,
    "ثنتين": 2,
    "تنين": 2,
    "ثلاثة": 3,
    "ثلاث": 3,
    "تلاتة": 3,
    "تلات": 3,
    "اربعة": 4,
    "اربعه": 4,
    "اربع": 4,
    "أربعة": 4,
    "أربع": 4,
    "خمسة": 5,
    "خمس": 5,
    "خمسه": 5,
    "ستة": 6,
    "سته": 6,
    "ست": 6,
    "سبعة": 7,
    "سبع": 7,
    "سبعه": 7,
    "ثلاثه": 3,
    "تسعه": 9,
    "ثمانية": 8,
    "ثمان": 8,
    "تمانية": 8,
    "تمان": 8,
    "تسعة": 9,
    "تسع": 9,
}

_AR_TENS: dict[str, int] = {
    "عشرة": 10,
    "عشر": 10,
    "عشرون": 20,
    "عشرين": 20,
    "ثلاثون": 30,
    "ثلاثين": 30,
    "اربعون": 40,
    "اربعين": 40,
    "أربعون": 40,
    "أربعين": 40,
    "خمسون": 50,
    "خمسين": 50,
    "ستون": 60,
    "ستين": 60,
    "سبعون": 70,
    "سبعين": 70,
    "ثمانون": 80,
    "ثمانين": 80,
    "تسعون": 90,
    "تسعين": 90,
}


def generate_alexa_link_code() -> str:
    """Return a new 6-digit numeric code (e.g. 482916)."""
    return "".join(str(secrets.randbelow(10)) for _ in range(ALEXA_LINK_CODE_DIGITS))


def normalize_arabic_speech(text: str) -> str:
    """Normalize Arabic utterances for intent matching (public helper)."""
    return _normalize_arabic_text(text)


def _normalize_arabic_text(text: str) -> str:
    t = (text or "").translate(_ARABIC_INDIC_DIGITS)
    t = re.sub(r"[\u064B-\u065F\u0670]", "", t)
    t = (
        t.replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ة", "ه")
        .replace("ى", "ي")
    )
    return t.lower().strip()


def _parse_arabic_tens_ones(fragment: str) -> int | None:
    fragment = _normalize_arabic_text(fragment)
    if not fragment:
        return None
    if fragment in _AR_ONES:
        return _AR_ONES[fragment]
    if fragment in _AR_TENS:
        return _AR_TENS[fragment]
    parts = [p.strip() for p in re.split(r"\s+و\s+", fragment) if p.strip()]
    if len(parts) == 2:
        a, b = parts
        if a in _AR_ONES and b in _AR_TENS:
            return _AR_TENS[b] + _AR_ONES[a]
        if a in _AR_TENS and b in _AR_ONES:
            return _AR_TENS[a] + _AR_ONES[b]
    return None


def _parse_arabic_hundred_chunks(text: str) -> str:
    """Parse phrases like «خمس ميه ثلاث و تسعون» → 593 (may repeat for 6 digits)."""
    normalized = _normalize_arabic_text(text)
    if not normalized:
        return ""

    chunks = re.findall(
        r"\w+\s+(?:مية|مئة|ميه)(?:\s+.+?)?(?=\s+\w+\s+(?:مية|مئة|ميه)|$)",
        normalized,
    )
    if not chunks:
        return ""

    parts: list[str] = []
    for chunk in chunks:
        match = re.match(
            r"(\w+)\s+(?:مية|مئة|ميه)\s*(.*)$",
            chunk.strip(),
        )
        if not match:
            continue
        hundred_word = match.group(1)
        rest = (match.group(2) or "").strip()
        if hundred_word not in _AR_ONES:
            continue
        value = _AR_ONES[hundred_word] * 100
        if rest:
            tail = _parse_arabic_tens_ones(rest)
            if tail is not None:
                value += tail
        parts.append(f"{value:03d}")

    joined = "".join(parts)
    if len(joined) == ALEXA_LINK_CODE_DIGITS:
        return joined
    return ""


def _parse_arabic_digit_sequence(text: str) -> str:
    """Parse «اربعة، ستة، تسعة، خمسة، سبعة، ثلاثة» → 469573."""
    normalized = _normalize_arabic_text(text)
    if not normalized:
        return ""

    tokens = [tok for tok in re.split(r"[\s,،]+|\s+و\s+", normalized) if tok]
    digits: list[str] = []
    for tok in tokens:
        if tok in _AR_ONES:
            digits.append(str(_AR_ONES[tok]))
        elif tok.isdigit() and len(tok) == 1:
            digits.append(tok)
        elif re.fullmatch(r"\d{2,3}", tok):
            for ch in tok:
                digits.append(ch)
        if len(digits) >= ALEXA_LINK_CODE_DIGITS:
            break

    if len(digits) >= ALEXA_LINK_CODE_DIGITS:
        return "".join(digits[:ALEXA_LINK_CODE_DIGITS])
    return ""


def _parse_arabic_spoken_code(text: str) -> str:
    by_digit = _parse_arabic_digit_sequence(text)
    if by_digit:
        return by_digit
    return _parse_arabic_hundred_chunks(text)


def normalize_alexa_link_code(raw: str) -> str:
    """
    Normalize spoken or typed link codes.
    - New format: exactly 6 digits (first 6 if user says more).
    - Legacy: 8-character hex (A-F0-9) when letters A-F are present.
    - Arabic: digit-by-digit words or «X مية Y و Z» hundred phrases.
    """
    text = (raw or "").strip()
    if not text:
        return ""

    text = text.translate(_ARABIC_INDIC_DIGITS)
    text = re.sub(
        r"\b(LINK|CODE|IS|MY|ربط|كود|الرمز|رقم|الرقم)\b",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    compact = re.sub(r"[^A-Za-z0-9]", "", text).upper()

    if re.search(r"[A-F]", compact):
        match = re.search(r"[A-F0-9]{8}", compact)
        if match:
            return match.group(0)

    digits = re.sub(r"\D", "", text)
    if len(digits) >= ALEXA_LINK_CODE_DIGITS:
        return digits[:ALEXA_LINK_CODE_DIGITS]

    arabic = _parse_arabic_spoken_code(raw)
    if arabic:
        return arabic

    if len(compact) >= 8 and re.fullmatch(r"[0-9]{8}", compact[:8]):
        return compact[:8]

    return ""


def format_alexa_link_code_display(code: str | None) -> str:
    """Human-friendly grouping for dashboards (482 916 or 1E7B 423D)."""
    if not code:
        return ""
    c = (code or "").strip().upper()
    if re.fullmatch(r"\d{6}", c):
        return f"{c[:3]} {c[3:]}"
    if re.fullmatch(r"[A-F0-9]{8}", c):
        return f"{c[:4]} {c[4:]}"
    return c


def format_alexa_link_code_speech(code: str | None) -> str:
    """Digits separated for voice prompts (4، 6، 9، 5، 7، 3)."""
    if not code:
        return ""
    c = (code or "").strip()
    if re.fullmatch(r"\d{6}", c):
        return "، ".join(c)
    if re.fullmatch(r"[A-F0-9]{8}", c, re.IGNORECASE):
        return "، ".join(c.upper())
    return c
