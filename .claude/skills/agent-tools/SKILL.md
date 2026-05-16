---
name: agent-tools
description: Use this skill whenever working on the agent layer or its tools — the FastMCP server, the query tool, the describe-data-model tool, or the structured view-spec the agent emits. Trigger this for any task that touches how the agent turns a prompt into a query or into a chart/table, how tools are added or changed, or anything involving the agent's output contract. Always consult this before editing mcp-server/ or the agent loop in api/.
---

# Agent tools and the view-spec contract

The agent's whole job is: turn a manager's prompt into a **structured view
spec**. It does not write SQL. It does not write frontend code. It picks defined
measures and chooses a view. Everything below keeps that boundary intact.

## The output contract — a view spec

The agent returns exactly this JSON and nothing else. It never includes `data`;
the backend runs the query and attaches results.

```json
{
  "narrative": "One short sentence describing the view.",
  "cube_query": {
    "measures": ["absences.holiday_days_taken"],
    "dimensions": ["employees.full_name"],
    "filters": [
      { "member": "employees.team", "operator": "equals", "values": ["Engineering"] }
    ],
    "timeDimensions": [
      { "dimension": "absences.absence_date", "dateRange": "2026" }
    ]
  },
  "view": {
    "type": "bar_chart",
    "x": "employees.full_name",
    "y": "absences.holiday_days_taken"
  }
}
```

`view.type` ∈ `bar_chart` | `line_chart` | `pie_chart` | `table` | `stat`.
Charts use `x`, `y`, optional `series`. Tables use `columns`. `stat` uses `y`.

Validate the agent's JSON against this schema before using it. On a malformed
response, re-prompt the agent with the validation error — do not try to repair
it heuristically.

## The MCP tools

The FastMCP server in `mcp-server/server.py` exposes exactly two tools.

**`describe_data_model`** — returns the catalog of measures and dimensions the
manager is allowed to query (the `manager_analytics` view). The agent calls this
first, or is given the catalog in its system prompt, so it only ever references
real fields. An agent that guesses field names will produce broken queries.

**`query_hr_metrics`** — takes a `cube_query` object only. It forwards the query
to Cube and returns rows. It does **not** take a scope, team, or identity
argument — see the rule below.

## Adding a tool

Use the FastMCP decorator and keep inputs typed and minimal:

```python
@mcp.tool
def describe_data_model() -> dict:
    """Return the measures and dimensions available to this manager."""
    ...
```

Hard limits when adding tools:

- **Never add a tool that accepts a raw SQL string.** The agent must not have a
  SQL path, directly or indirectly.
- **Never add a tool parameter for scope, team, manager id, or "view as".** The
  manager's scope comes from the authenticated session and is attached by the
  trusted backend when it mints the Cube token — never from an LLM-filled
  argument. If the agent could set its own scope, the whole permission model is
  void.
- Keep tools read-only. This app reports on HR data; it never writes it.

## The context frame and drill-down

The backend keeps a context frame per conversation:

```json
{ "active_employee": null, "active_team": null, "date_range": "2026" }
```

Pass it to the agent each turn. The agent resolves follow-ups against it:
"how many days did *they* take" means `active_employee`; "the team" means
`active_team`. Clicking a name in a rendered view sets `active_employee`. Surface
the frame in the UI so the manager can see and reset what the agent assumes —
when the agent guesses wrong, the manager needs an obvious way to correct it.

## System prompt guidance for the agent

Tell the agent plainly: it outputs only the view spec JSON; it chooses `view`
from the five allowed types; it uses only fields from `describe_data_model`; it
never writes SQL or code; and when a request is ambiguous it states the
assumption it made in `narrative` (e.g. "Assuming the current team, Engineering")
rather than guessing silently.

## Before you finish

- The agent's response is schema-validated before use.
- No tool takes raw SQL or a scope/identity argument.
- All tools are read-only.
- The context frame is passed in and updated on drill-down.
