"""Tool execution layer used by the agent loop.

This is the in-process equivalent of `mcp-server/server.py`. The MCP server is
the canonical tool surface — it lets Claude Code (and any other MCP client)
exercise the same tools during development. At runtime the FastAPI agent calls
the functions here directly to avoid spawning a subprocess per request, but the
behaviour and security contract are identical.

SECURITY: the manager scope is taken from a trusted `ManagerIdentity`, never
from an LLM-supplied argument. Every public function here takes that identity
explicitly. There is no `team` parameter exposed to the agent.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

import httpx
import jwt
import psycopg

from auth import ManagerIdentity

CUBE_API_URL = os.environ.get("CUBE_API_URL", "http://localhost:4000/cubejs-api/v1")
CUBE_API_SECRET = os.environ.get("CUBE_API_SECRET", "dev-only-secret-change-me")
AUDIT_DB_URL = os.environ.get(
    "AUDIT_DB_URL", "postgresql://api_writer:api@localhost:5432/hr"
)
MANAGER_VIEW = "manager_analytics"


def _scoped_cube_token(manager: ManagerIdentity) -> str:
    """Mint a short-lived Cube JWT carrying the manager's scope."""
    if not manager.team:
        raise PermissionError("No manager scope — refusing to query.")
    # Cube exposes the JWT payload itself as `securityContext` in queryRewrite,
    # so put the scope claims at the top level — not nested under another key.
    payload = {
        "team": manager.team,
        "exp": int(time.time()) + 120,
    }
    return jwt.encode(payload, CUBE_API_SECRET, algorithm="HS256")


def _write_audit_log(manager: ManagerIdentity, cube_query: dict, row_count: int) -> None:
    if not AUDIT_DB_URL:
        return
    try:
        with psycopg.connect(AUDIT_DB_URL, autocommit=True) as conn:
            conn.execute(
                """
                INSERT INTO audit_log (manager_email, manager_scope, cube_query, row_count)
                VALUES (%s, %s, %s::jsonb, %s)
                """,
                (manager.email, manager.team, json.dumps(cube_query), row_count),
            )
    except Exception as e:
        print(f"[audit] FAILED to write audit_log: {e!r}", flush=True)


def describe_data_model(manager: ManagerIdentity) -> dict:
    """Catalog of measures and dimensions the manager may query."""
    token = _scoped_cube_token(manager)
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(f"{CUBE_API_URL}/meta", headers={"Authorization": token})
            resp.raise_for_status()
            meta = resp.json()
    except Exception as e:
        return {
            "view": MANAGER_VIEW,
            "error": f"Could not reach Cube /meta: {e}",
            "measures": [],
            "dimensions": [],
        }

    target = next(
        (c for c in meta.get("cubes", []) if c.get("name") == MANAGER_VIEW),
        None,
    )
    if target is None:
        return {
            "view": MANAGER_VIEW,
            "error": f"View '{MANAGER_VIEW}' not found.",
            "measures": [],
            "dimensions": [],
        }

    def _trim(f: dict) -> dict:
        return {
            "name": f["name"],
            "type": f.get("type"),
            "description": f.get("shortTitle") or f.get("title") or "",
        }

    return {
        "view": MANAGER_VIEW,
        "measures": [_trim(m) for m in target.get("measures", [])],
        "dimensions": [_trim(d) for d in target.get("dimensions", [])],
    }


def _normalise_date_range(value: Any) -> Any:
    """Convert bare year strings like '2026' to a Cube-compatible date array.

    Cube's date parser rejects bare years; it needs either a named range
    ('this year') or an explicit two-element array (['2026-01-01', '2026-12-31']).
    """
    if isinstance(value, str) and len(value) == 4 and value.isdigit():
        return [f"{value}-01-01", f"{value}-12-31"]
    return value


def query_hr_metrics(manager: ManagerIdentity, cube_query: dict) -> dict[str, Any]:
    """Run a structured Cube query under the manager's scope.

    The scope is enforced by the signed token; there is no `team` parameter
    here that the agent could fill in.
    """
    token = _scoped_cube_token(manager)
    # Cube rejects null values anywhere in the query. Strip them at the top
    # level and also inside timeDimensions entries (e.g. granularity: null).
    clean_query = {k: v for k, v in cube_query.items() if v is not None}
    if "timeDimensions" in clean_query:
        clean_query["timeDimensions"] = [
            {k: _normalise_date_range(v) if k == "dateRange" else v
             for k, v in td.items() if v is not None}
            for td in clean_query["timeDimensions"]
        ]
    with httpx.Client(timeout=20.0) as client:
        resp = client.post(
            f"{CUBE_API_URL}/load",
            headers={"Authorization": token},
            json={"query": clean_query},
        )
        resp.raise_for_status()
        payload = resp.json()

    rows = payload.get("data", [])
    _write_audit_log(manager, cube_query, len(rows))

    return {"rows": rows, "annotation": payload.get("annotation", {})}
