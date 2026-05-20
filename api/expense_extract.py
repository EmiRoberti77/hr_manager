"""Receipt image extraction via Claude vision."""

from __future__ import annotations

import base64
import json
import os
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

import anthropic
from pydantic import BaseModel, Field

MAX_RECEIPT_BYTES = 10 * 1024 * 1024
ALLOWED_MEDIA = frozenset({"image/jpeg", "image/png", "image/webp"})


class LineItemExtraction(BaseModel):
    description: str
    quantity: Decimal = Decimal("1")
    unit_price: Decimal | None = None
    amount: Decimal


class ReceiptExtraction(BaseModel):
    merchant: str | None = None
    expense_date: date | None = None
    currency: str = "GBP"
    category: str = "other"
    line_items: list[LineItemExtraction] = Field(default_factory=list)
    total_amount: Decimal | None = None


def _media_type(filename: str, content_type: str | None) -> str:
    if content_type and content_type in ALLOWED_MEDIA:
        return content_type
    ext = Path(filename).suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(ext, "image/jpeg")


def _parse_json_response(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def extract_receipt(image_bytes: bytes, filename: str, content_type: str | None) -> ReceiptExtraction:
    """Send receipt image to Claude vision and return structured extraction."""
    if len(image_bytes) > MAX_RECEIPT_BYTES:
        raise ValueError("Receipt image exceeds 10 MB limit")
    if len(image_bytes) == 0:
        raise ValueError("Empty image file")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    media_type = _media_type(filename, content_type)
    if media_type not in ALLOWED_MEDIA:
        raise ValueError(f"Unsupported image type: {media_type}")

    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    client = anthropic.Anthropic(api_key=api_key)

    prompt = (
        "Extract this receipt image into JSON with exactly this shape:\n"
        "{\n"
        '  "merchant": "store name or null",\n'
        '  "expense_date": "YYYY-MM-DD or null",\n'
        '  "currency": "GBP",\n'
        '  "category": "travel|meals|office|other",\n'
        '  "line_items": [\n'
        '    {"description": "item name", "quantity": 1, "unit_price": 10.50, "amount": 10.50}\n'
        "  ],\n"
        '  "total_amount": 42.99\n'
        "}\n"
        "Use numeric amounts only (no currency symbols). "
        "If unclear, best-effort extract; use category 'other' when unsure. "
        "Return JSON only, no markdown."
    )

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )

    text = "".join(block.text for block in response.content if block.type == "text")
    data = _parse_json_response(text)

    category = str(data.get("category", "other")).lower()
    if category not in {"travel", "meals", "office", "other"}:
        category = "other"

    line_items = []
    for item in data.get("line_items") or []:
        line_items.append(
            LineItemExtraction(
                description=str(item.get("description", "Item")).strip() or "Item",
                quantity=Decimal(str(item.get("quantity", 1))),
                unit_price=(
                    Decimal(str(item["unit_price"])) if item.get("unit_price") is not None else None
                ),
                amount=Decimal(str(item.get("amount", 0))),
            )
        )

    expense_date = None
    if data.get("expense_date"):
        expense_date = date.fromisoformat(str(data["expense_date"])[:10])

    total = data.get("total_amount")
    return ReceiptExtraction(
        merchant=(str(data["merchant"]).strip() if data.get("merchant") else None),
        expense_date=expense_date,
        currency=str(data.get("currency", "GBP"))[:3].upper(),
        category=category,
        line_items=line_items,
        total_amount=Decimal(str(total)) if total is not None else None,
    )
