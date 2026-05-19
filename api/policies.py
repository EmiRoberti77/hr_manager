"""Policy document RAG REST API — upload, list, delete, chat."""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from auth import ManagerIdentity, get_manager, require_hr_admin
from policies_db import policies_conn, policies_ingest_conn
from policy_ingest import MAX_FILE_BYTES, ingest_document
from policy_rag import answer_policy_question

router = APIRouter(prefix="/policies", tags=["policies"])

VALID_CATEGORIES = frozenset(
    {"general", "holiday", "expenses", "travel", "safety", "benefits", "conduct"}
)
VALID_TEAMS = frozenset({"Engineering", "Sales", "People"})

UPLOAD_DIR = Path(
    os.environ.get("POLICY_UPLOAD_DIR", Path(__file__).resolve().parent.parent / "data/policy_uploads")
)


class PolicyChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None


class PolicyDocumentOut(BaseModel):
    id: int
    title: str
    filename: str
    team: str
    category: str
    uploaded_by_email: str
    uploaded_at: datetime
    status: str
    page_count: int | None
    error_message: str | None


class PolicySourceOut(BaseModel):
    document_id: int
    document_title: str
    page_number: int | None
    excerpt: str
    similarity: float


class PolicyChatResponse(BaseModel):
    conversation_id: str
    answer: str
    sources: list[PolicySourceOut]


def _ensure_upload_dir() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _run_ingest(document_id: int, storage_path: Path) -> None:
    try:
        ingest_document(document_id, storage_path)
    except Exception:
        pass  # ingest_document marks failed status


@router.get("/health")
def policies_health() -> dict:
    pgvector_ok = False
    try:
        with policies_ingest_conn() as conn:
            row = conn.execute(
                "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
            ).fetchone()
            pgvector_ok = bool(row and row[0])
    except Exception:
        pgvector_ok = False
    return {
        "ok": True,
        "openai_key_set": bool(os.environ.get("OPENAI_API_KEY")),
        "anthropic_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "pgvector_ok": pgvector_ok,
    }


@router.get("/documents", response_model=list[PolicyDocumentOut])
def list_documents(manager: ManagerIdentity = Depends(get_manager)) -> list[PolicyDocumentOut]:
    with policies_conn(manager) as conn:
        if manager.is_hr_admin:
            rows = conn.execute(
                """
                SELECT id, title, filename, team, category, uploaded_by_email,
                       uploaded_at, status, page_count, error_message
                FROM policy_documents
                ORDER BY uploaded_at DESC
                """
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, title, filename, team, category, uploaded_by_email,
                       uploaded_at, status, page_count, error_message
                FROM policy_documents
                WHERE team = %s
                ORDER BY uploaded_at DESC
                """,
                (manager.team,),
            ).fetchall()

    return [
        PolicyDocumentOut(
            id=row[0],
            title=row[1],
            filename=row[2],
            team=row[3],
            category=row[4],
            uploaded_by_email=row[5],
            uploaded_at=row[6],
            status=row[7],
            page_count=row[8],
            error_message=row[9],
        )
        for row in rows
    ]


@router.post("/documents", response_model=PolicyDocumentOut, status_code=201)
async def upload_document(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    team: str = Form(...),
    category: str = Form("general"),
    file: UploadFile = File(...),
    manager: ManagerIdentity = Depends(get_manager),
) -> PolicyDocumentOut:
    require_hr_admin(manager)

    if team not in VALID_TEAMS:
        raise HTTPException(status_code=400, detail=f"team must be one of: {sorted(VALID_TEAMS)}")
    category_norm = category.strip().lower() or "general"
    if category_norm not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"category must be one of: {sorted(VALID_CATEGORIES)}",
        )

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    raw = await file.read()
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit")
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")

    _ensure_upload_dir()
    safe_name = f"{uuid.uuid4().hex}_{Path(file.filename).name}"
    storage_path = UPLOAD_DIR / safe_name
    storage_path.write_bytes(raw)

    with policies_conn(manager) as conn:
        row = conn.execute(
            """
            INSERT INTO policy_documents
                (title, filename, storage_path, team, category, uploaded_by_email, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'processing')
            RETURNING id, title, filename, team, category, uploaded_by_email,
                      uploaded_at, status, page_count, error_message
            """,
            (
                title.strip(),
                file.filename,
                str(storage_path),
                team,
                category_norm,
                manager.email,
            ),
        ).fetchone()

    document_id = row[0]
    background_tasks.add_task(_run_ingest, document_id, storage_path)

    return PolicyDocumentOut(
        id=row[0],
        title=row[1],
        filename=row[2],
        team=row[3],
        category=row[4],
        uploaded_by_email=row[5],
        uploaded_at=row[6],
        status=row[7],
        page_count=row[8],
        error_message=row[9],
    )


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(
    document_id: int,
    manager: ManagerIdentity = Depends(get_manager),
) -> None:
    require_hr_admin(manager)

    with policies_conn(manager) as conn:
        row = conn.execute(
            "SELECT storage_path FROM policy_documents WHERE id = %s",
            (document_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        storage_path = Path(row[0])
        conn.execute("DELETE FROM policy_documents WHERE id = %s", (document_id,))

    if storage_path.is_file():
        storage_path.unlink(missing_ok=True)


@router.post("/chat", response_model=PolicyChatResponse)
def policy_chat(
    body: PolicyChatRequest,
    manager: ManagerIdentity = Depends(get_manager),
) -> PolicyChatResponse:
    if not manager.team:
        raise HTTPException(status_code=403, detail="Manager team is required for policy queries")

    conversation_id = UUID(body.conversation_id) if body.conversation_id else uuid.uuid4()

    try:
        result = answer_policy_question(manager, body.message.strip(), conversation_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return PolicyChatResponse(
        conversation_id=str(conversation_id),
        answer=result.answer,
        sources=[PolicySourceOut(**s) for s in result.sources],
    )
