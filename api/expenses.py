"""Employee expense REST API — receipt upload, extraction, review, submit."""

from __future__ import annotations

import json
import os
import uuid
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from auth import ManagerIdentity, get_manager, require_employee
from expense_extract import MAX_RECEIPT_BYTES, extract_receipt
from expenses_db import expenses_conn, expenses_process_conn

router = APIRouter(prefix="/expenses", tags=["expenses"])

VALID_CATEGORIES = frozenset({"travel", "meals", "office", "other"})

UPLOAD_DIR = Path(
    os.environ.get(
        "EXPENSE_UPLOAD_DIR",
        Path(__file__).resolve().parent.parent / "data/expense_receipts",
    )
)


class LineItemIn(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    unit_price: Decimal | None = None
    amount: Decimal


class LineItemOut(BaseModel):
    id: int
    description: str
    quantity: Decimal
    unit_price: Decimal | None
    amount: Decimal
    position: int


class ExpenseOut(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    employee_team: str
    status: str
    merchant: str | None
    expense_date: date | None
    currency: str
    total_amount: Decimal | None
    category: str
    receipt_filename: str
    error_message: str | None
    notes: str | None
    created_at: datetime
    submitted_at: datetime | None
    line_items: list[LineItemOut] = Field(default_factory=list)


class ExpenseUpdate(BaseModel):
    merchant: str | None = None
    expense_date: date | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    total_amount: Decimal | None = None
    category: str | None = None
    notes: str | None = None
    line_items: list[LineItemIn] | None = None


def _ensure_upload_dir() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _expense_from_rows(expense_row, line_rows: list) -> ExpenseOut:
    return ExpenseOut(
        id=expense_row[0],
        employee_id=expense_row[1],
        employee_name=expense_row[2],
        employee_team=expense_row[3],
        status=expense_row[4],
        merchant=expense_row[5],
        expense_date=expense_row[6],
        currency=expense_row[7],
        total_amount=expense_row[8],
        category=expense_row[9],
        receipt_filename=expense_row[10],
        error_message=expense_row[11],
        notes=expense_row[12],
        created_at=expense_row[13],
        submitted_at=expense_row[14],
        line_items=[
            LineItemOut(
                id=r[0],
                description=r[1],
                quantity=r[2],
                unit_price=r[3],
                amount=r[4],
                position=r[5],
            )
            for r in line_rows
        ],
    )


_EXPENSE_SELECT = """
    SELECT ex.id, ex.employee_id, e.full_name, t.name, ex.status,
           ex.merchant, ex.expense_date, ex.currency, ex.total_amount,
           ex.category, ex.receipt_filename, ex.error_message, ex.notes,
           ex.created_at, ex.submitted_at
    FROM expenses ex
    JOIN employees e ON e.id = ex.employee_id
    JOIN teams t ON t.id = e.team_id
"""


def _fetch_expense(conn, expense_id: int) -> ExpenseOut | None:
    row = conn.execute(
        _EXPENSE_SELECT + " WHERE ex.id = %s",
        (expense_id,),
    ).fetchone()
    if not row:
        return None
    lines = conn.execute(
        """
        SELECT id, description, quantity, unit_price, amount, position
        FROM expense_line_items
        WHERE expense_id = %s
        ORDER BY position, id
        """,
        (expense_id,),
    ).fetchall()
    return _expense_from_rows(row, lines)


def _run_extraction(
    expense_id: int, storage_path: Path, filename: str, content_type: str | None
) -> None:
    try:
        extraction = extract_receipt(storage_path.read_bytes(), filename, content_type)
        with expenses_process_conn() as conn:
            conn.execute(
                """
                UPDATE expenses
                SET status = 'draft',
                    merchant = %s,
                    expense_date = %s,
                    currency = %s,
                    total_amount = %s,
                    category = %s,
                    extraction_raw = %s::jsonb,
                    error_message = NULL
                WHERE id = %s
                """,
                (
                    extraction.merchant,
                    extraction.expense_date,
                    extraction.currency,
                    extraction.total_amount,
                    extraction.category,
                    json.dumps(extraction.model_dump(mode="json")),
                    expense_id,
                ),
            )
            conn.execute("DELETE FROM expense_line_items WHERE expense_id = %s", (expense_id,))
            for i, item in enumerate(extraction.line_items):
                conn.execute(
                    """
                    INSERT INTO expense_line_items
                        (expense_id, description, quantity, unit_price, amount, position)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        expense_id,
                        item.description,
                        item.quantity,
                        item.unit_price,
                        item.amount,
                        i,
                    ),
                )
    except Exception as exc:
        with expenses_process_conn() as conn:
            conn.execute(
                """
                UPDATE expenses
                SET status = 'failed', error_message = %s
                WHERE id = %s
                """,
                (str(exc)[:2000], expense_id),
            )


@router.get("", response_model=list[ExpenseOut])
def list_expenses(manager: ManagerIdentity = Depends(get_manager)) -> list[ExpenseOut]:
    with expenses_conn(manager) as conn:
        rows = conn.execute(_EXPENSE_SELECT + " ORDER BY ex.created_at DESC").fetchall()
        result = []
        for row in rows:
            lines = conn.execute(
                """
                SELECT id, description, quantity, unit_price, amount, position
                FROM expense_line_items WHERE expense_id = %s ORDER BY position, id
                """,
                (row[0],),
            ).fetchall()
            result.append(_expense_from_rows(row, lines))
    return result


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(
    expense_id: int,
    manager: ManagerIdentity = Depends(get_manager),
) -> ExpenseOut:
    with expenses_conn(manager) as conn:
        expense = _fetch_expense(conn, expense_id)
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@router.post("/receipts", response_model=ExpenseOut, status_code=201)
async def upload_receipt(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    manager: ManagerIdentity = Depends(get_manager),
) -> ExpenseOut:
    require_employee(manager)

    content_type = file.content_type or ""
    if not content_type.startswith("image/") and not file.filename:
        raise HTTPException(status_code=400, detail="Only image receipts are supported")

    raw = await file.read()
    if len(raw) > MAX_RECEIPT_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    _ensure_upload_dir()
    safe_name = f"{uuid.uuid4().hex}_{Path(file.filename or 'receipt.jpg').name}"
    storage_path = UPLOAD_DIR / safe_name
    storage_path.write_bytes(raw)

    with expenses_conn(manager) as conn:
        row = conn.execute(
            """
            INSERT INTO expenses
                (employee_id, status, receipt_filename, storage_path, currency, category)
            VALUES (%s, 'processing', %s, %s, 'GBP', 'other')
            RETURNING id
            """,
            (manager.employee_id, file.filename or safe_name, str(storage_path)),
        ).fetchone()
        expense_id = row[0]
        expense = _fetch_expense(conn, expense_id)

    assert expense is not None
    background_tasks.add_task(
        _run_extraction,
        expense_id,
        storage_path,
        file.filename or safe_name,
        content_type or None,
    )
    return expense


@router.patch("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    body: ExpenseUpdate,
    manager: ManagerIdentity = Depends(get_manager),
) -> ExpenseOut:
    require_employee(manager)

    with expenses_conn(manager) as conn:
        row = conn.execute(
            "SELECT employee_id, status FROM expenses WHERE id = %s",
            (expense_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Expense not found")
        if row[0] != manager.employee_id:
            raise HTTPException(status_code=403, detail="Cannot edit another employee's expense")
        if row[1] != "draft":
            raise HTTPException(status_code=400, detail="Only draft expenses can be edited")

        if body.category is not None and body.category not in VALID_CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")

        updates: list[str] = []
        params: list[object] = []
        if body.merchant is not None:
            updates.append("merchant = %s")
            params.append(body.merchant)
        if body.expense_date is not None:
            updates.append("expense_date = %s")
            params.append(body.expense_date)
        if body.currency is not None:
            updates.append("currency = %s")
            params.append(body.currency.upper())
        if body.total_amount is not None:
            updates.append("total_amount = %s")
            params.append(body.total_amount)
        if body.category is not None:
            updates.append("category = %s")
            params.append(body.category)
        if body.notes is not None:
            updates.append("notes = %s")
            params.append(body.notes)

        if updates:
            params.append(expense_id)
            conn.execute(
                f"UPDATE expenses SET {', '.join(updates)} WHERE id = %s",
                params,
            )

        if body.line_items is not None:
            conn.execute("DELETE FROM expense_line_items WHERE expense_id = %s", (expense_id,))
            for i, item in enumerate(body.line_items):
                conn.execute(
                    """
                    INSERT INTO expense_line_items
                        (expense_id, description, quantity, unit_price, amount, position)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        expense_id,
                        item.description,
                        item.quantity,
                        item.unit_price,
                        item.amount,
                        i,
                    ),
                )

        expense = _fetch_expense(conn, expense_id)

    assert expense is not None
    return expense


@router.post("/{expense_id}/submit", response_model=ExpenseOut)
def submit_expense(
    expense_id: int,
    manager: ManagerIdentity = Depends(get_manager),
) -> ExpenseOut:
    require_employee(manager)

    with expenses_conn(manager) as conn:
        expense = _fetch_expense(conn, expense_id)
        if not expense:
            raise HTTPException(status_code=404, detail="Expense not found")
        if expense.employee_id != manager.employee_id:
            raise HTTPException(status_code=403, detail="Cannot submit another employee's expense")
        if expense.status != "draft":
            raise HTTPException(status_code=400, detail="Only draft expenses can be submitted")
        if not expense.line_items:
            raise HTTPException(status_code=400, detail="Expense must have at least one line item")
        if expense.total_amount is None:
            raise HTTPException(status_code=400, detail="Total amount is required")

        line_sum = sum(item.amount for item in expense.line_items)
        if abs(line_sum - expense.total_amount) > Decimal("0.05"):
            raise HTTPException(
                status_code=400,
                detail=f"Line items sum ({line_sum}) does not match total ({expense.total_amount})",
            )

        conn.execute(
            """
            UPDATE expenses
            SET status = 'submitted', submitted_at = now()
            WHERE id = %s
            """,
            (expense_id,),
        )
        expense = _fetch_expense(conn, expense_id)

    assert expense is not None
    return expense


@router.delete("/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    manager: ManagerIdentity = Depends(get_manager),
) -> None:
    require_employee(manager)

    with expenses_conn(manager) as conn:
        row = conn.execute(
            "SELECT employee_id, status, storage_path FROM expenses WHERE id = %s",
            (expense_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Expense not found")
        if row[0] != manager.employee_id:
            raise HTTPException(status_code=403, detail="Cannot delete another employee's expense")
        if row[1] not in ("processing", "draft", "failed"):
            raise HTTPException(status_code=400, detail="Only draft or failed expenses can be deleted")
        storage_path = Path(row[2])
        conn.execute("DELETE FROM expenses WHERE id = %s", (expense_id,))

    if storage_path.is_file():
        storage_path.unlink(missing_ok=True)
