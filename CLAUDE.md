# CLAUDE.md — Conversational HR Analytics (sample app)

This file is the project brief. Read it fully before starting any task. It tells
you what to build, the architecture, the rules that must not be broken, and the
order to build things in.

## What this project is

A sample web application where HR managers ask questions in plain language about
their company — headcount, turnover, who is on holiday, individual employee
records — and get back **dynamic charts and tables**. The conversation supports
drill-down: the manager can pick a person from a result, ask a follow-up about
them, and a new view appears. Example session:

1. "Show me a chart of the holiday schedule for the engineering team" → bar chart
2. "Put that in a table instead" → same data, table view
3. (manager clicks a name) "What is their role and how many days have they taken?"
   → a stat/table view for that one person

This is a learning scaffold, not production software. Where production would
need more (real SSO, hardened infra), the brief says so explicitly.

## Architecture

Five layers. A prompt flows down; a rendered view flows back up.

```
HR manager prompt
      │
Agent          interprets intent, resolves the active entity/team/range,
               builds a Cube query, chooses a view  (Anthropic SDK)
      │
Semantic layer Cube — compiles the query to SQL, enforces the manager's
               permission scope. THIS is where access control lives.
      │
Analytics DB   PostgreSQL — HR data, row-level security as defence in depth
      │
Agent          turns the result into a declarative view spec
      │
Interactive    React renders a chart or table; manager drills down → new prompt
view           (the loop carries conversation context)
```

The agent is central here because the app is **read-only** — nobody is harmed by
a wrong chart the way they would be by a wrong payment. But that freedom shifts
the hard problems to two places: query correctness and access control. The rules
below exist to keep those two safe.

## Non-negotiable rules

These are the load-bearing constraints. Do not relax them to make a task easier.

1. **The agent never writes or sees raw SQL.** It emits a structured Cube query
   object (measures, dimensions, filters, time dimensions). Cube generates the
   SQL. There is no code path where LLM output becomes a SQL string.

2. **Permissions are enforced in the data layer, never by the agent.** The
   manager's scope (which teams they may see, which columns) is enforced by the
   Cube security context and Postgres row-level security. The LLM must never
   supply, receive, or influence that scope. A clever prompt must not be able to
   widen access.

3. **The agent emits view specs, not code.** The agent returns declarative JSON
   describing a view ("bar chart, x = employee, y = days"). The frontend has a
   fixed renderer that maps specs to components. The agent never produces JSX,
   HTML, or chart-library calls.

4. **Every metric is defined exactly once**, as a measure in the Cube model. The
   agent picks from defined measures; it never invents an aggregation. This is
   why "holiday days taken" returns the same number regardless of phrasing.

5. **All data access is audit-logged**: who asked, the query that ran, the
   manager scope it ran under, and a timestamp.

6. **Restricted data is gated in the model, not by agent judgement.** Sensitive
   fields (e.g. sickness reasons, salary outside scope, protected
   characteristics) are excluded from the manager-facing Cube view. Do not rely
   on the agent to decline — keep the data out of its reach entirely.

## Tech stack

| Layer        | Choice                                              |
|--------------|-----------------------------------------------------|
| Language     | Python 3.12+ (managed with `uv`), TypeScript        |
| Backend      | FastAPI — hosts the agent loop and conversation     |
| Agent        | `anthropic` SDK, tool-use loop                      |
| Tool layer   | `fastmcp` — the MCP server in `mcp-server/`         |
| Semantic layer | Cube (runs as a service via Docker)               |
| Database     | PostgreSQL 16 (Docker for local dev)                |
| Frontend     | React + Vite + TypeScript, Recharts, TanStack Table |
| Local infra  | Docker Compose (Postgres + Cube)                    |

Prefer `uv` for all Python work. Give runnable, copy-paste commands in any
instructions you produce.

## Repository layout

Items marked *(provided)* already exist — do not recreate them. Everything else
is yours to build, guided by this brief and the skills.

```
hr-analytics-sample/
├── CLAUDE.md                     (provided) this brief
├── .mcp.json                     (provided) registers the MCP server
├── .claude/skills/               (provided) Claude Code skills — read them
├── docker-compose.yml            Postgres + Cube for local dev
├── db/
│   ├── schema.sql                employees, teams, absences, employment_events, audit_log
│   ├── rls.sql                   row-level security policies
│   └── seed.sql                  realistic sample data (~40 employees, 3 teams)
├── cube/
│   └── model/
│       ├── cubes/                one .yml per cube
│       └── views/                manager-facing curated views
├── mcp-server/                   (provided) FastMCP tool server — stub to extend
│   ├── server.py
│   └── pyproject.toml
├── api/                          FastAPI backend + agent loop
│   ├── main.py                   HTTP endpoints, conversation store
│   ├── agent.py                  the tool-use loop
│   ├── context.py                the conversation "context frame"
│   └── auth.py                   mock identity → manager scope (see Phase 4)
└── web/                          React frontend
    ├── src/Chat.tsx              prompt input + transcript
    └── src/ViewRenderer.tsx      maps a view spec → chart or table
```

## Contracts

These two shapes are how the layers talk. Keep them stable.

### The agent's output — a view spec

The agent returns exactly this JSON. It never includes `data` — the backend runs
the query and attaches results before sending to the frontend.

```json
{
  "narrative": "Holiday days taken per engineer in 2026.",
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

`view.type` is one of: `bar_chart`, `line_chart`, `pie_chart`, `table`, `stat`.
Charts use `x`, `y`, and optional `series`. Tables use `columns`.

### The conversation context frame

The backend keeps this per conversation. The agent reads it to resolve follow-ups
("how many days did *they* take" → `active_employee`). Surface it in the UI so
the manager can see and reset it.

```json
{
  "active_employee": null,
  "active_team": null,
  "date_range": "2026"
}
```

## Build order

Work in phases. Finish and sanity-check each before moving on.

- **Phase 0 — Skeleton.** Create `docker-compose.yml` (Postgres + Cube), the
  directory tree, and a `uv` project for `api/`. Confirm `docker compose up`
  starts both services.
- **Phase 1 — Data.** Write `db/schema.sql`, `db/seed.sql`, `db/rls.sql`. Tables:
  `employees`, `teams`, `absences`, `employment_events`, `audit_log`. Seed ~40
  employees across 3 teams with a year of absence records. Enable RLS.
- **Phase 2 — Semantic layer.** Build the Cube model under `cube/model/`. Use
  the **cube-data-model** skill. Add the manager-facing view and the security
  context. Verify every example query in the Cube Playground (localhost:4000).
- **Phase 3 — Tool layer.** Extend `mcp-server/server.py`. Use the
  **agent-tools** skill. Implement `query_hr_metrics` and `describe_data_model`.
- **Phase 4 — Backend + agent.** Build `api/`. The agent loop connects to the
  MCP server, reads the context frame, emits a view spec. `auth.py` is a **mock**
  for the sample: it maps a chosen demo user to a manager scope. Add a clear
  `TODO: replace with real SSO` — production must not ship the mock.
- **Phase 5 — Frontend.** Build `web/`: a chat panel and `ViewRenderer.tsx` that
  maps a view spec to a Recharts chart or a TanStack table. Show the context frame.
- **Phase 6 — Drill-down.** Make follow-ups resolve against the context frame:
  clicking a name sets `active_employee`; pronouns resolve to it.

Before completing any phase that touches `db/`, `cube/`, `mcp-server/`, or the
agent code, run the **permissions-audit** skill.

## Local dev

```bash
# infra
docker compose up -d

# backend
cd api && uv sync && uv run uvicorn main:app --reload

# frontend
cd web && npm install && npm run dev
```

The Anthropic API key is read from the `ANTHROPIC_API_KEY` environment variable.
Never hard-code it. Never commit `.env`.

## Skills in this repo

`.claude/skills/` contains three skills. Consult them — they hold the detail this
brief only summarises:

- **cube-data-model** — adding or changing cubes, measures, dimensions, joins,
  views, and the security context.
- **agent-tools** — the MCP tools, the agent's output contract, and the view spec.
- **permissions-audit** — the access-control checklist; run it before finishing
  any change that touches data access.

## The MCP server

`mcp-server/` is a FastMCP server exposing the agent's tools. It is dual-use: the
FastAPI agent connects to it at runtime, and `.mcp.json` registers it so Claude
Code can exercise the same tools while developing. Keep tool inputs typed and
minimal, and never add a tool that accepts raw SQL or a scope/identity argument
from the caller (see rule 2).

## Conventions

- Python: type hints everywhere, `ruff` for lint/format, small focused modules.
- Never invent Cube or Claude Code config syntax from memory — both evolve.
  Check the current Cube docs and Claude Code docs when wiring config.
- Keep secrets in environment variables; provide a `.env.example`, never a `.env`.
- When you finish a unit of work, state what you built and how to run it.
