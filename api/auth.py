"""Mock authentication for the sample app.

TODO: replace with real SSO before production. The current implementation maps a
chosen demo-user header to a fixed manager scope. A real implementation would
verify a session/JWT from the SSO provider and look up the manager's team(s)
from a directory of record.

The output of this module — a `ManagerIdentity` — is the *only* thing trusted to
set the manager's scope. The agent must never see, supply, or influence it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import Header, HTTPException

AccountRole = Literal["hr_admin", "manager", "employee"]


@dataclass(frozen=True)
class ManagerIdentity:
    email: str
    team: str  # the single team this manager may see, e.g. "Engineering"
    is_hr_admin: bool = False
    is_manager: bool = True  # False for employee-only demo accounts
    employee_id: int | None = None  # resolved from employees table, never from client


# Demo users — manager identities and employee-only staff for expenses demo.
_DEMO_USERS: dict[str, ManagerIdentity] = {
    "ava.thompson@example.com": ManagerIdentity(
        email="ava.thompson@example.com", team="Engineering", is_manager=True
    ),
    "tara.underwood@example.com": ManagerIdentity(
        email="tara.underwood@example.com", team="Sales", is_manager=True
    ),
    "gemma.hale@example.com": ManagerIdentity(
        email="gemma.hale@example.com", team="People", is_manager=True
    ),
    "hr.admin@example.com": ManagerIdentity(
        email="hr.admin@example.com", team="People", is_hr_admin=True, is_manager=True
    ),
    "chloe.davies@example.com": ManagerIdentity(
        email="chloe.davies@example.com", team="Engineering", is_manager=False
    ),
    "umar.vance@example.com": ManagerIdentity(
        email="umar.vance@example.com", team="Sales", is_manager=False
    ),
    "maya.north@example.com": ManagerIdentity(
        email="maya.north@example.com", team="People", is_manager=False
    ),
}


def _account_role(user: ManagerIdentity) -> AccountRole:
    if user.is_hr_admin:
        return "hr_admin"
    if user.is_manager:
        return "manager"
    return "employee"


def _enrich_with_employee_id(user: ManagerIdentity) -> ManagerIdentity:
    """Attach employee_id from DB lookup (lazy import avoids circular deps)."""
    from expenses_db import lookup_employee_id

    employee_id = lookup_employee_id(user.email)
    if employee_id == user.employee_id:
        return user
    return ManagerIdentity(
        email=user.email,
        team=user.team,
        is_hr_admin=user.is_hr_admin,
        is_manager=user.is_manager,
        employee_id=employee_id,
    )


def list_demo_users() -> list[dict]:
    return [
        {
            "email": u.email,
            "team": u.team,
            "is_hr_admin": u.is_hr_admin,
            "is_manager": u.is_manager,
            "role": _account_role(u),
            "employee_id": _enrich_with_employee_id(u).employee_id,
        }
        for u in _DEMO_USERS.values()
    ]


def get_manager(
    x_demo_user: str | None = Header(default=None),
) -> ManagerIdentity:
    """FastAPI dependency: resolve the demo user header to a ManagerIdentity.

    Fails closed: an unknown or missing header returns 401, never a default
    "all access" identity.
    """
    if not x_demo_user:
        raise HTTPException(status_code=401, detail="Missing X-Demo-User header")
    user = _DEMO_USERS.get(x_demo_user.strip().lower())
    if not user:
        raise HTTPException(status_code=401, detail=f"Unknown demo user: {x_demo_user}")
    return _enrich_with_employee_id(user)


def require_hr_admin(manager: ManagerIdentity) -> None:
    """Raise 403 unless the caller is an HR admin."""
    if not manager.is_hr_admin:
        raise HTTPException(status_code=403, detail="HR admin access required")


def require_employee(manager: ManagerIdentity) -> None:
    """Raise 403 unless the caller maps to an active employee record."""
    if manager.employee_id is None:
        raise HTTPException(
            status_code=403,
            detail="No employee record linked to this account — cannot submit expenses",
        )
