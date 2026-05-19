"""Vector retrieval and Claude answers for policy questions."""

from __future__ import annotations

import os
from dataclasses import dataclass
from uuid import UUID

import anthropic
from openai import OpenAI

from auth import ManagerIdentity
from policies_db import policies_conn
from policy_ingest import _vector_literal, embed_texts

TOP_K = 8
MAX_HISTORY = 10


@dataclass
class RetrievedChunk:
    id: int
    document_id: int
    document_title: str
    page_number: int | None
    content: str
    similarity: float


@dataclass
class PolicyAnswer:
    answer: str
    sources: list[dict]
    chunk_ids: list[int]


def _embed_query(query: str) -> list[float]:
    return embed_texts([query])[0]


def retrieve_chunks(manager: ManagerIdentity, query: str, top_k: int = TOP_K) -> list[RetrievedChunk]:
    """Team-scoped vector search; team always comes from manager identity."""
    if not manager.team and not manager.is_hr_admin:
        return []

    vector = _embed_query(query)
    team = manager.team

    with policies_conn(manager) as conn:
        if manager.is_hr_admin and not team:
            # HR admin without team filter sees nothing unless they have a team in identity.
            team = manager.team

        if not team:
            return []

        rows = conn.execute(
            """
            SELECT
                c.id,
                c.document_id,
                d.title,
                c.page_number,
                c.content,
                1 - (c.embedding <=> %s::vector) AS similarity
            FROM policy_chunks c
            JOIN policy_documents d ON d.id = c.document_id
            WHERE d.status = 'ready'
              AND d.team = %s
            ORDER BY c.embedding <=> %s::vector
            LIMIT %s
            """,
            (_vector_literal(vector), team, _vector_literal(vector), top_k),
        ).fetchall()

    return [
        RetrievedChunk(
            id=row[0],
            document_id=row[1],
            document_title=row[2],
            page_number=row[3],
            content=row[4],
            similarity=float(row[5]),
        )
        for row in rows
    ]


def _load_history(
    conn, conversation_id: UUID, manager_email: str
) -> list[dict[str, str]]:
    rows = conn.execute(
        """
        SELECT role, content
        FROM policy_chat_messages
        WHERE conversation_id = %s AND manager_email = %s
        ORDER BY created_at ASC
        LIMIT %s
        """,
        (conversation_id, manager_email, MAX_HISTORY * 2),
    ).fetchall()
    return [{"role": row[0], "content": row[1]} for row in rows]


def _save_message(conn, conversation_id: UUID, manager_email: str, role: str, content: str) -> None:
    conn.execute(
        """
        INSERT INTO policy_chat_messages (conversation_id, manager_email, role, content)
        VALUES (%s, %s, %s, %s)
        """,
        (conversation_id, manager_email, role, content),
    )


def _log_query(
    conn,
    manager: ManagerIdentity,
    question: str,
    chunk_ids: list[int],
) -> None:
    conn.execute(
        """
        INSERT INTO policy_query_log (manager_email, team, question, chunk_ids)
        VALUES (%s, %s, %s, %s)
        """,
        (manager.email, manager.team, question, chunk_ids),
    )


def answer_policy_question(
    manager: ManagerIdentity,
    question: str,
    conversation_id: UUID,
) -> PolicyAnswer:
    """Retrieve context, call Claude, persist chat history and audit log."""
    chunks = retrieve_chunks(manager, question)
    sources = [
        {
            "document_id": c.document_id,
            "document_title": c.document_title,
            "page_number": c.page_number,
            "excerpt": c.content[:400],
            "similarity": round(c.similarity, 4),
        }
        for c in chunks
    ]
    chunk_ids = [c.id for c in chunks]

    if not chunks:
        answer = (
            f"I could not find any policy documents for the {manager.team} team "
            "that match your question. Ask your HR administrator to upload relevant policies."
        )
        with policies_conn(manager) as conn:
            _save_message(conn, conversation_id, manager.email, "user", question)
            _save_message(conn, conversation_id, manager.email, "assistant", answer)
            _log_query(conn, manager, question, [])
        return PolicyAnswer(answer=answer, sources=[], chunk_ids=[])

    context_blocks = []
    for i, c in enumerate(chunks, start=1):
        page = f", page {c.page_number}" if c.page_number else ""
        context_blocks.append(
            f"[{i}] {c.document_title}{page}\n{c.content}"
        )
    context_text = "\n\n---\n\n".join(context_blocks)

    system = (
        "You are an HR policy assistant. Answer ONLY using the provided policy excerpts. "
        "If the answer is not in the excerpts, say you could not find it in the available policies. "
        "Cite sources by document title and page number when available. "
        "Be concise and practical."
    )

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    with policies_conn(manager) as conn:
        history = _load_history(conn, conversation_id, manager.email)

    user_content = (
        f"Policy excerpts for team {manager.team}:\n\n{context_text}\n\n"
        f"Question: {question}"
    )

    messages: list[dict] = []
    for turn in history[-MAX_HISTORY:]:
        if turn["role"] in ("user", "assistant"):
            messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": user_content})

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system,
        messages=messages,
    )
    answer = "".join(block.text for block in response.content if block.type == "text")

    with policies_conn(manager) as conn:
        _save_message(conn, conversation_id, manager.email, "user", question)
        _save_message(conn, conversation_id, manager.email, "assistant", answer)
        _log_query(conn, manager, question, chunk_ids)

    return PolicyAnswer(answer=answer, sources=sources, chunk_ids=chunk_ids)
