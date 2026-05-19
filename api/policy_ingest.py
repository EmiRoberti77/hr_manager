"""PDF extraction, chunking, embedding, and persistence for policy documents."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import tiktoken
from openai import OpenAI
from pypdf import PdfReader

from policies_db import policies_ingest_conn

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536
CHUNK_TOKENS = 500
CHUNK_OVERLAP = 80
MAX_FILE_BYTES = 10 * 1024 * 1024

_enc: tiktoken.Encoding | None = None


def _encoding() -> tiktoken.Encoding:
    global _enc
    if _enc is None:
        _enc = tiktoken.get_encoding("cl100k_base")
    return _enc


def _vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in vector) + "]"


@dataclass
class PageText:
    page_number: int
    text: str


@dataclass
class TextChunk:
    chunk_index: int
    content: str
    page_number: int | None
    token_count: int


def extract_pdf_pages(path: Path) -> list[PageText]:
    reader = PdfReader(str(path))
    pages: list[PageText] = []
    for i, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append(PageText(page_number=i, text=text))
    if not pages:
        raise ValueError("No extractable text found in PDF (scanned images are not supported)")
    return pages


def chunk_pages(pages: list[PageText]) -> list[TextChunk]:
    """Split page text into overlapping token chunks."""
    chunks: list[TextChunk] = []
    buffer = ""
    buffer_page: int | None = None
    chunk_index = 0

    def flush_buffer() -> None:
        nonlocal buffer, buffer_page, chunk_index
        if not buffer.strip():
            return
        tokens = _encoding().encode(buffer)
        chunks.append(
            TextChunk(
                chunk_index=chunk_index,
                content=buffer.strip(),
                page_number=buffer_page,
                token_count=len(tokens),
            )
        )
        chunk_index += 1
        buffer = ""
        buffer_page = None

    for page in pages:
        paragraph = page.text
        candidate = f"{buffer}\n\n{paragraph}".strip() if buffer else paragraph
        token_count = len(_encoding().encode(candidate))

        if token_count <= CHUNK_TOKENS:
            if not buffer:
                buffer_page = page.page_number
            buffer = candidate
            continue

        if buffer:
            flush_buffer()

        tokens = _encoding().encode(paragraph)
        start = 0
        while start < len(tokens):
            end = min(start + CHUNK_TOKENS, len(tokens))
            piece = _encoding().decode(tokens[start:end])
            chunks.append(
                TextChunk(
                    chunk_index=chunk_index,
                    content=piece.strip(),
                    page_number=page.page_number,
                    token_count=end - start,
                )
            )
            chunk_index += 1
            if end >= len(tokens):
                break
            start = end - CHUNK_OVERLAP

    flush_buffer()
    return chunks


def embed_texts(texts: list[str]) -> list[list[float]]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    client = OpenAI(api_key=api_key)
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    ordered = sorted(response.data, key=lambda d: d.index)
    vectors = [item.embedding for item in ordered]
    if any(len(v) != EMBEDDING_DIM for v in vectors):
        raise RuntimeError("Unexpected embedding dimensions from OpenAI")
    return vectors


def ingest_document(document_id: int, pdf_path: Path) -> None:
    """Extract, chunk, embed, and store chunks; update document status."""
    try:
        pages = extract_pdf_pages(pdf_path)
        chunks = chunk_pages(pages)
        if not chunks:
            raise ValueError("No chunks produced from PDF")

        vectors = embed_texts([c.content for c in chunks])

        with policies_ingest_conn() as conn:
            conn.execute(
                "DELETE FROM policy_chunks WHERE document_id = %s",
                (document_id,),
            )
            for chunk, vector in zip(chunks, vectors, strict=True):
                conn.execute(
                    """
                    INSERT INTO policy_chunks
                        (document_id, chunk_index, content, page_number, token_count, embedding)
                    VALUES (%s, %s, %s, %s, %s, %s::vector)
                    """,
                    (
                        document_id,
                        chunk.chunk_index,
                        chunk.content,
                        chunk.page_number,
                        chunk.token_count,
                        _vector_literal(vector),
                    ),
                )
            conn.execute(
                """
                UPDATE policy_documents
                SET status = 'ready', page_count = %s, error_message = NULL
                WHERE id = %s
                """,
                (len(pages), document_id),
            )
    except Exception as exc:
        with policies_ingest_conn() as conn:
            conn.execute(
                """
                UPDATE policy_documents
                SET status = 'failed', error_message = %s
                WHERE id = %s
                """,
                (str(exc)[:2000], document_id),
            )
        raise
