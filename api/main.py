"""FastAPI app: chat endpoint, context-frame inspection, demo-user listing.

Run:
    uv run uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import os
import uuid
from typing import Any

from dotenv import find_dotenv, load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Walk up from cwd so the API works whether started from repo root or from api/.
load_dotenv(find_dotenv(usecwd=True))

from agent import run_turn  # noqa: E402
from auth import ManagerIdentity, get_manager, list_demo_users  # noqa: E402
from context import store  # noqa: E402

app = FastAPI(title="HR Analytics Sample API")

# CORS for the Vite dev server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str
    # Optional override the UI can send when the manager clicks a name in a result.
    set_active_employee: str | None = None


class ResetFrameRequest(BaseModel):
    conversation_id: str


@app.get("/demo-users")
def demo_users() -> list[dict]:
    return list_demo_users()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "anthropic_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
    }


@app.get("/conversations/{conversation_id}")
def get_conversation(
    conversation_id: str, manager: ManagerIdentity = Depends(get_manager)
) -> dict[str, Any]:
    try:
        convo = store.get_or_create(conversation_id, manager.email)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {
        "conversation_id": convo.conversation_id,
        "frame": convo.frame.to_dict(),
        "last_view_spec": convo.last_view_spec,
        "message_count": len(convo.messages),
    }


@app.post("/conversations/reset-frame")
def reset_frame(
    body: ResetFrameRequest, manager: ManagerIdentity = Depends(get_manager)
) -> dict[str, Any]:
    try:
        store.get_or_create(body.conversation_id, manager.email)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    store.reset_frame(body.conversation_id)
    return {"ok": True}


@app.post("/chat")
def chat(
    body: ChatRequest, manager: ManagerIdentity = Depends(get_manager)
) -> dict[str, Any]:
    conversation_id = body.conversation_id or str(uuid.uuid4())
    try:
        convo = store.get_or_create(conversation_id, manager.email)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

    if body.set_active_employee is not None:
        convo.frame.active_employee = body.set_active_employee or None

    result = run_turn(convo, manager, body.message)
    result["conversation_id"] = conversation_id
    return result
