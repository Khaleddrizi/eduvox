"""Alexa child link codes: 6-digit numeric (new) with legacy 8-char hex support."""
from __future__ import annotations

import re
import secrets

ALEXA_LINK_CODE_DIGITS = 6


def generate_alexa_link_code() -> str:
    """Return a new 6-digit numeric code (e.g. 482916)."""
    return "".join(str(secrets.randbelow(10)) for _ in range(ALEXA_LINK_CODE_DIGITS))


def normalize_alexa_link_code(raw: str) -> str:
    """
    Normalize spoken or typed link codes.
    - New format: exactly 6 digits (first 6 if user says more).
    - Legacy: 8-character hex (A-F0-9) when letters A-F are present.
    """
    text = (raw or "").strip()
    if not text:
        return ""

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
