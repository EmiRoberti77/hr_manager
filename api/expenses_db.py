"""Postgres access for the employee expenses module."""

from __future__ import annotations

import os
from collections.abc import Generator
from contextlib import contextmanager

import psycopg
from psycopg import sql

from auth import ManagerIdentity

EXPENSES_DB_URL = os.environ.get(
    "EXPENSES_DB_URL",
    os.environ.get("AUDIT_DB_URL", "postgresql://api_writer:api@localhost:5432/hr"),
)


def lookup_employee_id(email: str) -> int | None:
    """Resolve active employee id from email — trusted server-side auth lookup."""
    with psycopg.connect(EXPENSES_DB_URL) as conn:
        conn.autocommit = False
        # HR-admin session flag is set only for this lookup (existing RLS policy).
        conn.execute("SET LOCAL app.is_hr_admin = 'true'")
        row = conn.execute(
            """
            SELECT id FROM employees
            WHERE lower(email) = lower(%s) AND end_date IS NULL
            """,
            (email.strip(),),
        ).fetchone()
        conn.commit()
    return row[0] if row else None


def _apply_session(conn: psycopg.Connection, manager: ManagerIdentity) -> None:
    if manager.is_hr_admin:
        conn.execute("SET LOCAL app.is_hr_admin = 'true'")
    if manager.team:
        conn.execute(
            sql.SQL("SET LOCAL app.manager_team = {}").format(sql.Literal(manager.team))
        )
    if manager.employee_id is not None:
        conn.execute(
            sql.SQL("SET LOCAL app.employee_id = {}").format(sql.Literal(str(manager.employee_id)))
        )


@contextmanager
def expenses_conn(manager: ManagerIdentity) -> Generator[psycopg.Connection, None, None]:
    """Open a connection with RLS session variables."""
    with psycopg.connect(EXPENSES_DB_URL) as conn:
        conn.autocommit = False
        _apply_session(conn, manager)
        yield conn
        conn.commit()


@contextmanager
def expenses_process_conn() -> Generator[psycopg.Connection, None, None]:
    """Trusted server path for background receipt extraction."""
    with psycopg.connect(EXPENSES_DB_URL) as conn:
        conn.autocommit = False
        conn.execute("SET LOCAL app.is_hr_admin = 'true'")
        yield conn
        conn.commit()
