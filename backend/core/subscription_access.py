"""
Subscription / library access rules (cash billing, admin-set dates).
"""
from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from typing import Any


def default_grace_days() -> int:
    return max(0, int(os.getenv("SUBSCRIPTION_DEFAULT_GRACE_DAYS", "14")))


def _as_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def compute_subscription_state(
    paid_until: Any,
    grace_days: int | None,
    *,
    billing_exempt: bool = False,
) -> dict[str, Any]:
    """
    paid_until: last calendar day included in the paid period (inclusive).
    Grace runs for `grace_days` full calendar days after that day.
    Library frozen / new assigns blocked when today is after paid_until + grace_days.
    """
    if billing_exempt:
        return {
            "billing_exempt": True,
            "paid_until": None,
            "grace_days": None,
            "library_frozen": False,
            "in_grace_period": False,
            "new_program_assign_blocked": False,
        }
    pu = _as_date(paid_until)
    g = default_grace_days() if grace_days is None else max(0, int(grace_days))
    today = datetime.now(timezone.utc).date()
    if pu is None:
        return {
            "billing_exempt": False,
            "paid_until": None,
            "grace_days": g,
            "library_frozen": False,
            "in_grace_period": False,
            "new_program_assign_blocked": False,
        }
    last_accessible = pu + timedelta(days=g)
    frozen = today > last_accessible
    in_grace = (not frozen) and (today > pu)
    return {
        "billing_exempt": False,
        "paid_until": pu.isoformat(),
        "grace_days": g,
        "library_frozen": frozen,
        "in_grace_period": in_grace,
        "new_program_assign_blocked": frozen,
    }


def library_frozen(paid_until: Any, grace_days: int | None, *, billing_exempt: bool = False) -> bool:
    return bool(compute_subscription_state(paid_until, grace_days, billing_exempt=billing_exempt)["library_frozen"])


def subscription_state_for_specialist_row(
    is_shadow: bool,
    paid_until: Any,
    grace_days: int | None,
    billing_exempt: bool,
) -> dict[str, Any]:
    if is_shadow:
        return compute_subscription_state(None, None, billing_exempt=True)
    return compute_subscription_state(paid_until, grace_days, billing_exempt=billing_exempt)


def subscription_state_for_parent_row(
    account_kind: str,
    paid_until: Any,
    grace_days: int | None,
    billing_exempt: bool,
) -> dict[str, Any]:
    kind = (account_kind or "linked").strip().lower()
    exempt = billing_exempt or kind == "linked"
    return compute_subscription_state(paid_until, grace_days, billing_exempt=exempt)
