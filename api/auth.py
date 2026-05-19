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

from fastapi import Header, HTTPException


@dataclass(frozen=True)
class ManagerIdentity:
    email: str
    team: str  # the single team this manager may see, e.g. "Engineering"
    is_hr_admin: bool = False


# Demo users — the only manager identities the sample knows about.
_DEMO_USERS: dict[str, ManagerIdentity] = {
    "ava.thompson@example.com": ManagerIdentity(
        email="ava.thompson@example.com", team="Engineering"
    ),
    "tara.underwood@example.com": ManagerIdentity(
        email="tara.underwood@example.com", team="Sales"
    ),
    "gemma.hale@example.com": ManagerIdentity(
        email="gemma.hale@example.com", team="People"
    ),
    "hr.admin@example.com": ManagerIdentity(
        email="hr.admin@example.com", team="People", is_hr_admin=True
    ),
}


def list_demo_users() -> list[dict]:
    return [
        {"email": u.email, "team": u.team, "is_hr_admin": u.is_hr_admin}
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
    return user


def require_hr_admin(manager: ManagerIdentity) -> None:
    """Raise 403 unless the caller is an HR admin."""
    if not manager.is_hr_admin:
        raise HTTPException(status_code=403, detail="HR admin access required")
