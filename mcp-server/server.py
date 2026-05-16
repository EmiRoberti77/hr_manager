"""HR Analytics MCP server.

Exposes the agent's tool layer for the conversational HR analytics app.

Two tools, both read-only:
  - describe_data_model  : the catalog of measures/dimensions the agent may use
  - query_hr_metrics     : run a structured Cube query, return rows

SECURITY — read before changing anything here
----------------------------------------------
The manager's permission scope is NOT a tool argument. The LLM must never be
able to choose, widen, or pass a scope. The scope is provided out-of-band by the
trusted backend and used here to mint a scoped Cube token. In this sample the
scope is read from DEMO_MANAGER_SCOPE / DEMO_MANAGER_EMAIL env vars set by the
backend / .mcp.json. In production, replace this with the per-request session
identity from real SSO — see api/auth.py.

Run:
    uv run python server.py
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

import httpx
import jwt
import psycopg
from fastmcp import FastMCP

mcp = FastMCP("hr-analytics")

CUBE_API_URL = os.environ.get("CUBE_API_URL", "http://localhost:4000/cubejs-api/v1")
CUBE_API_SECRET = os.environ.get("CUBE_API_SECRET", "")
MANAGER_VIEW = "manager_analytics"

# Sample-only. In production the scope is the authenticated manager's session
# identity, injected per request by the backend — never an env default.
DEMO_MANAGER_SCOPE = os.environ.get("DEMO_MANAGER_SCOPE", "")
DEMO_MANAGER_EMAIL = os.environ.get("DEMO_MANAGER_EMAIL", "demo.manager@example.com")

# Audit log goes via api_writer (INSERT-only) so a compromised MCP process cannot
# rewrite history. Empty string disables audit (used by unit tests).
AUDIT_DB_URL = os.environ.get(
    "AUDIT_DB_URL", "postgresql://api_writer:api@localhost:5432/hr"
)


def _scoped_cube_token() -> str:
    """Mint a short-lived Cube JWT carrying the manager's scope.

    Cube reads this token's claims as the securityContext and its queryRewrite
    rule turns the scope into a mandatory SQL filter. Because the scope is baked
    into a server-signed token, the agent cannot tamper with it.
    """
    if not DEMO_MANAGER_SCOPE:
        # Fail closed: no scope means no query. Never default to "all".
        raise PermissionError("No manager scope available — refusing to query.")
    # Cube exposes the JWT payload itself as `securityContext` in queryRewrite,
    # so put the scope claims at the top level — not nested under another key.
    payload = {
        "team": DEMO_MANAGER_SCOPE,
        "exp": int(time.time()) + 120,
    }
    return jwt.encode(payload, CUBE_API_SECRET, algorithm="HS256")


def _write_audit_log(cube_query: dict, row_count: int) -> None:
    if not AUDIT_DB_URL:
        return
    try:
        with psycopg.connect(AUDIT_DB_URL, autocommit=True) as conn:
            conn.execute(
                """
                INSERT INTO audit_log (manager_email, manager_scope, cube_query, row_count)
                VALUES (%s, %s, %s::jsonb, %s)
                """,
                (DEMO_MANAGER_EMAIL, DEMO_MANAGER_SCOPE, json.dumps(cube_query), row_count),
            )
    except Exception as e:
        # Auditing must not block a query response, but every failure must be
        # visible — log loudly. In production this would page.
        print(f"[audit] FAILED to write audit_log: {e!r}", flush=True)


@mcp.tool
def describe_data_model() -> dict:
    """Return the measures and dimensions the manager is allowed to query.

    The agent should call this before building a query so it only ever
    references real fields from the manager-facing Cube view. Returns a
    catalog, never any employee data.
    """
    token = _scoped_cube_token()
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                f"{CUBE_API_URL}/meta",
                headers={"Authorization": token},
            )
            resp.raise_for_status()
            meta = resp.json()
    except Exception as e:
        # If Cube is unavailable, return a minimal hard-coded fallback so the
        # agent can still respond with a useful error path during development.
        return {
            "view": MANAGER_VIEW,
            "error": f"Could not reach Cube /meta: {e}",
            "measures": [],
            "dimensions": [],
        }

    # Cube returns cubes AND views in meta["cubes"]. Find the manager view.
    target = next(
        (c for c in meta.get("cubes", []) if c.get("name") == MANAGER_VIEW),
        None,
    )
    if target is None:
        return {
            "view": MANAGER_VIEW,
            "error": f"View '{MANAGER_VIEW}' not found in Cube meta.",
            "measures": [],
            "dimensions": [],
        }

    def _trim(field: dict) -> dict:
        return {
            "name": field["name"],
            "type": field.get("type"),
            "description": field.get("shortTitle") or field.get("title") or "",
        }

    return {
        "view": MANAGER_VIEW,
        "measures": [_trim(m) for m in target.get("measures", [])],
        "dimensions": [_trim(d) for d in target.get("dimensions", [])],
        "segments": [_trim(s) for s in target.get("segments", [])],
    }


@mcp.tool
def query_hr_metrics(cube_query: dict) -> dict:
    """Run a structured Cube query and return the resulting rows.

    `cube_query` is a Cube query object: measures, dimensions, filters,
    timeDimensions. There is deliberately no scope/team/identity parameter —
    the manager's scope is enforced by the signed token minted below.

    Returns {"rows": [...], "query": {...}}. Raises on a missing scope.
    """
    token = _scoped_cube_token()

    # Cube rejects top-level null values (e.g. {"order": null}); some clients
    # serialise optional fields as null. Drop them before sending.
    clean_query = {k: v for k, v in cube_query.items() if v is not None}
    with httpx.Client(timeout=20.0) as client:
        resp = client.post(
            f"{CUBE_API_URL}/load",
            headers={"Authorization": token},
            json={"query": clean_query},
        )
        resp.raise_for_status()
        payload: dict[str, Any] = resp.json()

    rows = payload.get("data", [])
    _write_audit_log(cube_query, len(rows))

    return {
        "rows": rows,
        "query": cube_query,
        "annotation": payload.get("annotation", {}),
    }


if __name__ == "__main__":
    # stdio transport — this is what .mcp.json launches.
    mcp.run()
