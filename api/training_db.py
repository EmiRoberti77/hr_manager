"""Postgres access for the training module."""

from __future__ import annotations

import os
from collections.abc import Generator
from contextlib import contextmanager

import psycopg
from psycopg import sql

from auth import ManagerIdentity

TRAINING_DB_URL = os.environ.get(
    "TRAINING_DB_URL",
    os.environ.get("AUDIT_DB_URL", "postgresql://api_writer:api@localhost:5432/hr"),
)


@contextmanager
def training_conn(manager: ManagerIdentity) -> Generator[psycopg.Connection, None, None]:
    """Open a connection; set app.manager_team for RLS on enrollments (managers only)."""
    with psycopg.connect(TRAINING_DB_URL) as conn:
        conn.autocommit = False
        if manager.is_hr_admin:
            conn.execute("SET LOCAL app.is_hr_admin = 'true'")
        elif manager.team:
            conn.execute(
                sql.SQL("SET LOCAL app.manager_team = {}").format(sql.Literal(manager.team))
            )
        yield conn
        conn.commit()
