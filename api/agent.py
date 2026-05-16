"""The agent loop.

A single conversational turn:
  1. Run an Anthropic tool-use loop. Tools available to the model:
       - describe_data_model: catalog of allowed fields
       - query_hr_metrics: peek at rows (optional)
       - submit_view: terminal action — the model emits the view spec here
  2. When `submit_view` is called we have a validated view spec. We re-run its
     cube_query to attach fresh rows, then return everything to the caller.

The model never sees raw SQL, never receives the manager scope as input, and
never emits frontend code. Its only output is the structured view spec.
"""

from __future__ import annotations

import json
import os
from typing import Any

from anthropic import Anthropic
from pydantic import ValidationError

from auth import ManagerIdentity
from context import Conversation
from tools import describe_data_model, query_hr_metrics
from view_spec import ViewSpec

MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-7")
MAX_LOOP_ITERATIONS = 6

_anthropic = Anthropic()

SYSTEM_PROMPT = """You are an HR analytics assistant. A manager talks to you in
plain English; you reply with a single structured view spec that the frontend
will render as a chart or table.

Hard rules:
- You never write SQL, HTML, JSX, or any code. Your only output is a view spec
  produced via the `submit_view` tool.
- Use only the measures and dimensions returned by `describe_data_model`. If a
  field is not in the catalog you cannot use it — say so in `narrative`.
- The manager's team scope is enforced automatically. Do not put a team filter
  in the cube_query; one will be added for you. Do not ask the manager to pick
  a team they cannot see.
- Pick the simplest `view.type` that suits the question:
    * `stat` — one number (e.g. headcount of the team)
    * `bar_chart` / `pie_chart` — comparisons across categories
    * `line_chart` — anything over time (always pair with a timeDimension)
    * `table` — multiple columns of per-person detail
    * `map` — when the manager asks where staff are based or wants a geographic
      view. Set `lat_key` = "manager_analytics.latitude",
      `lng_key` = "manager_analytics.longitude", and `label_key` to the
      dimension best for pin labels (e.g. "manager_analytics.full_name").
      Always include latitude, longitude, and at least one label dimension.
- If the manager says "put that in a table" or "make it a chart", reuse the
  previous cube_query and only change `view`.
- If the request is ambiguous, state your assumption in `narrative` (e.g.
  "Assuming the active employee, Chloe Davies").
- When the manager names a specific employee or focuses on a single person, set
  `frame_update.active_employee` so follow-ups can use pronouns. Clear it (set
  to null) when the manager moves on to a team-wide question.

The context frame is provided each turn:
  active_employee: who "they"/"him"/"her" refers to
  active_team:     the team currently being discussed
  date_range:      the date range to assume if none is given (e.g. "2026")

Always call `submit_view` once you have decided. Do not emit a final text-only
message."""


SUBMIT_VIEW_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "narrative": {
            "type": "string",
            "description": "One short sentence explaining the view to the manager.",
        },
        "cube_query": {
            "type": "object",
            "properties": {
                "measures": {"type": "array", "items": {"type": "string"}},
                "dimensions": {"type": "array", "items": {"type": "string"}},
                "filters": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "member": {"type": "string"},
                            "operator": {"type": "string"},
                            "values": {"type": "array", "items": {"type": "string"}},
                        },
                        "required": ["member", "operator"],
                    },
                },
                "timeDimensions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "dimension": {"type": "string"},
                            "dateRange": {
                                "oneOf": [
                                    {"type": "string"},
                                    {"type": "array", "items": {"type": "string"}},
                                ]
                            },
                            "granularity": {"type": "string"},
                        },
                        "required": ["dimension"],
                    },
                },
                "limit": {"type": "integer"},
            },
        },
                "view": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": ["bar_chart", "line_chart", "pie_chart", "table", "stat", "map"],
                },
                "x": {"type": "string"},
                "y": {"type": "string"},
                "series": {"type": "string"},
                "columns": {"type": "array", "items": {"type": "string"}},
                "lat_key": {"type": "string", "description": "Cube field for latitude (maps only)."},
                "lng_key": {"type": "string", "description": "Cube field for longitude (maps only)."},
                "label_key": {"type": "string", "description": "Cube field for map pin label (maps only)."},
            },
            "required": ["type"],
        },
        "frame_update": {
            "type": "object",
            "description": (
                "Optional: update the conversation's context frame when you have "
                "resolved an entity from natural language (e.g. the manager named "
                "a specific employee). Omit fields you do not want to change."
            ),
            "properties": {
                "active_employee": {"type": ["string", "null"]},
                "active_team": {"type": ["string", "null"]},
                "date_range": {"type": ["string", "null"]},
            },
        },
    },
    "required": ["narrative", "cube_query", "view"],
}


TOOLS: list[dict[str, Any]] = [
    {
        "name": "describe_data_model",
        "description": "Return the catalog of measures and dimensions the manager may query.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "query_hr_metrics",
        "description": (
            "Run a Cube query and return the resulting rows. Use this only when "
            "you need to inspect data before choosing a view (e.g. to decide "
            "between a chart and a stat)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "cube_query": {"type": "object"},
            },
            "required": ["cube_query"],
        },
    },
    {
        "name": "submit_view",
        "description": (
            "Terminal action: emit the final view spec for the frontend to "
            "render. Call this exactly once when you have your answer."
        ),
        "input_schema": SUBMIT_VIEW_SCHEMA,
    },
]


def _frame_text(convo: Conversation) -> str:
    f = convo.frame
    return (
        f"<context_frame>\n"
        f"  active_employee: {f.active_employee or 'null'}\n"
        f"  active_team: {f.active_team or 'null'}\n"
        f"  date_range: {f.date_range or 'null'}\n"
        f"</context_frame>"
    )


def _execute_tool(
    name: str, args: dict, manager: ManagerIdentity
) -> tuple[str, dict | None]:
    """Run a tool; return (json-string-for-model, submitted_view_spec_or_None)."""
    if name == "describe_data_model":
        result = describe_data_model(manager)
        return json.dumps(result), None

    if name == "query_hr_metrics":
        cube_query = args.get("cube_query") or {}
        try:
            result = query_hr_metrics(manager, cube_query)
        except Exception as e:
            return json.dumps({"error": str(e)}), None
        # Truncate rows so we don't blow context — the model doesn't need all rows.
        rows = result.get("rows", [])
        return (
            json.dumps(
                {
                    "row_count": len(rows),
                    "rows_preview": rows[:10],
                    "annotation": result.get("annotation", {}),
                }
            ),
            None,
        )

    if name == "submit_view":
        try:
            spec = ViewSpec.model_validate(args)
        except ValidationError as e:
            return json.dumps({"validation_error": e.errors()}), None
        return json.dumps({"ok": True}), spec.model_dump(mode="json")

    return json.dumps({"error": f"Unknown tool: {name}"}), None


def run_turn(
    convo: Conversation, manager: ManagerIdentity, user_message: str
) -> dict[str, Any]:
    """One conversational turn. Returns the rendered payload for the UI."""

    convo.messages.append(
        {"role": "user", "content": f"{_frame_text(convo)}\n\n{user_message}"}
    )

    submitted_spec: dict | None = None

    for _ in range(MAX_LOOP_ITERATIONS):
        response = _anthropic.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=TOOLS,
            messages=convo.messages,
        )

        convo.messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            # Model ended without calling submit_view — nudge it once.
            convo.messages.append(
                {
                    "role": "user",
                    "content": (
                        "You must call the `submit_view` tool with your final "
                        "view spec. Do not reply with plain text."
                    ),
                }
            )
            continue

        tool_results = []
        for block in response.content:
            if getattr(block, "type", None) != "tool_use":
                continue
            tool_text, spec = _execute_tool(block.name, block.input, manager)
            if spec is not None:
                submitted_spec = spec
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": tool_text,
                }
            )

        convo.messages.append({"role": "user", "content": tool_results})

        if submitted_spec is not None:
            break

    if submitted_spec is None:
        return {
            "error": "Agent did not produce a valid view spec.",
            "frame": convo.frame.to_dict(),
        }

    # Apply any frame update the agent suggested.
    frame_update = submitted_spec.get("frame_update") or {}
    if "active_employee" in frame_update:
        convo.frame.active_employee = frame_update.get("active_employee")
    if "active_team" in frame_update:
        # Never let the agent widen scope here — only narrow within what the
        # manager can already see. The Cube security context still filters by
        # the manager's real team, so this is a UI hint, not a permission grant.
        convo.frame.active_team = frame_update.get("active_team")
    if frame_update.get("date_range") is not None:
        convo.frame.date_range = frame_update.get("date_range")

    # Run the agreed cube_query to attach fresh data.
    try:
        rows = query_hr_metrics(manager, submitted_spec["cube_query"])["rows"]
    except Exception as e:
        rows = []
        submitted_spec["narrative"] += f" (Query failed: {e})"

    convo.last_view_spec = submitted_spec

    return {
        "view_spec": submitted_spec,
        "data": rows,
        "frame": convo.frame.to_dict(),
    }
