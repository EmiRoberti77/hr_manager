"""Postgres access for the policy document RAG module."""

from __future__ import annotations

import os
from collections.abc import Generator
from contextlib import contextmanager

import psycopg
from psycopg import sql

from auth import ManagerIdentity

POLICIES_DB_URL = os.environ.get(
    "POLICIES_DB_URL",
    os.environ.get("AUDIT_DB_URL", "postgresql://api_writer:api@localhost:5432/hr"),
)


def _apply_session(conn: psycopg.Connection, manager: ManagerIdentity) -> None:
    if manager.is_hr_admin:
        conn.execute("SET LOCAL app.is_hr_admin = 'true'")
    # Always set team when present — needed for audit-log RLS even for HR admins.
    if manager.team:
        conn.execute(
            sql.SQL("SET LOCAL app.manager_team = {}").format(sql.Literal(manager.team))
        )
    conn.execute(
        sql.SQL("SET LOCAL app.manager_email = {}").format(sql.Literal(manager.email))
    )


@contextmanager
def policies_conn(manager: ManagerIdentity) -> Generator[psycopg.Connection, None, None]:
    """Open a connection with RLS session variables for the manager."""
    with psycopg.connect(POLICIES_DB_URL) as conn:
        conn.autocommit = False
        _apply_session(conn, manager)
        yield conn
        conn.commit()


@contextmanager
def policies_ingest_conn() -> Generator[psycopg.Connection, None, None]:
    """Connection for background ingest — HR-admin scope only (trusted server path)."""
    with psycopg.connect(POLICIES_DB_URL) as conn:
        conn.autocommit = False
        conn.execute("SET LOCAL app.is_hr_admin = 'true'")
        yield conn
        conn.commit()
