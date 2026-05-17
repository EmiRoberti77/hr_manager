# Conversational HR Analytics — Architecture & Guide

A sample web application where HR managers ask questions in plain language about their company—headcount, turnover, holidays, individual employees—and receive **dynamic charts and tables**. The system is **read-only**: the agent interprets intent and chooses queries; it never writes HR data or executes arbitrary SQL.

This document explains how the code works: services, data flows, the Cube semantic layer, security boundaries, and the agent loop.

---

## What you get

| Capability | Example prompt |
|------------|----------------|
| Team metrics | “What is my team headcount?” → stat |
| Comparisons | “Show holiday days taken per person in 2025” → bar chart |
| View switching | “Put that in a table instead” → same query, different view |
| Drill-down | Click a name in a table → follow-up about that person |
| Geography | “Where is my team based?” → map with pins |

Three demo managers (Engineering, Sales, People) each see **only their own team**. That restriction is enforced in the **data layer**, not by trusting the LLM.

---

## High-level architecture

The stack has five layers. A prompt flows **down**; a rendered view flows **back up**.

```mermaid
flowchart TB
    subgraph UI["Web (React + Vite)"]
        Chat["Chat.tsx — transcript, context frame"]
        VR["ViewRenderer.tsx — charts / tables / map"]
    end

    subgraph API["API (FastAPI)"]
        Auth["auth.py — mock identity → team scope"]
        Agent["agent.py — Anthropic tool-use loop"]
        Tools["tools.py — Cube client + audit log"]
        Ctx["context.py — conversation frame"]
    end

    subgraph AgentLayer["Agent tools"]
        MCP["mcp-server/ — FastMCP (dev / Claude Code)"]
    end

    subgraph Semantic["Cube (Docker)"]
        QR["cube.js — queryRewrite team filter"]
        View["manager_analytics view"]
        Cubes["employees · absences · employment_events"]
    end

    subgraph Data["PostgreSQL 16 (Docker)"]
        Tables["employees, teams, absences, …"]
        RLS["RLS policies (defence in depth)"]
        Audit["audit_log"]
    end

  Chat -->|POST /chat + X-Demo-User| Auth
  Auth --> Agent
  Agent --> Tools
  Tools -->|scoped JWT| Semantic
  Semantic -->|compiled SQL| Data
  Agent -->|view_spec + data| VR
  MCP -.->|same contract| Semantic
```

### Design principles (non-negotiable)

1. **The agent never writes or sees raw SQL.** It emits a structured Cube query object (`measures`, `dimensions`, `filters`, `timeDimensions`). Cube compiles SQL.
2. **Permissions live in the data layer.** The manager’s team scope is set by trusted auth and embedded in a signed Cube JWT. The LLM cannot widen access via prompts or tool arguments.
3. **The agent emits view specs, not UI code.** JSON like `{ "type": "bar_chart", "x": "...", "y": "..." }` is rendered by a fixed `ViewRenderer`—no generated JSX or chart-library calls from the model.
4. **Every metric is defined once** in the Cube model. The agent picks from the catalog; it does not invent aggregations.
5. **All queries are audit-logged** (who, scope, query, row count, timestamp).
6. **Sensitive fields are excluded from the model**, not hidden by prompt instructions (salary, date of birth, absence `reason`).

---

## Services and ports

| Service | Port | Role |
|---------|------|------|
| **PostgreSQL** | `5432` | HR data, RLS, `audit_log` |
| **Cube** | `4000` | REST API, Playground, query compilation |
| **Cube SQL API** | `5433` | Optional direct SQL port (dev) |
| **FastAPI** | `8000` | Chat, conversations, demo users |
| **Vite (React)** | `5173` | UI; proxies `/chat`, etc. to FastAPI |

```mermaid
flowchart LR
    Browser["Browser :5173"]
    API["FastAPI :8000"]
    Cube["Cube :4000"]
    PG["Postgres :5432"]

    Browser -->|proxy| API
    API -->|JWT + /load| Cube
    Cube -->|cube_reader| PG
    API -->|api_writer INSERT| PG
```

### Docker Compose

`docker-compose.yml` starts Postgres and Cube:

- Postgres runs init scripts in order: `db/schema.sql` → `db/rls.sql` → `db/seed.sql` (~40 employees, 3 teams, a year of absences).
- Cube mounts `cube/model/` and `cube/cube.js`, connects as **`cube_reader`** (not the table owner, so misconfiguration is visible).

---

## End-to-end request flow (one chat turn)

When a manager sends a message, the following happens:

```mermaid
sequenceDiagram
    participant U as Manager (browser)
    participant W as React App
    participant F as FastAPI
    participant A as Agent (Claude)
    participant T as tools.py
    participant C as Cube
    participant P as Postgres

    U->>W: Type question / click row
    W->>F: POST /chat<br/>X-Demo-User, message, conversation_id
    F->>F: get_manager() → team scope
    F->>F: Load context frame (active_employee, date_range)
    F->>A: messages + frame + system prompt

    loop Tool use (max 6 iterations)
        A->>T: describe_data_model / query_hr_metrics / submit_view
        T->>T: Mint JWT { team }
        T->>C: /meta or /load + Authorization
        C->>C: queryRewrite → inject team filter
        C->>P: SELECT …
        P-->>C: rows
        C-->>T: data
        T->>P: INSERT audit_log
        T-->>A: tool result
    end

    A-->>F: submit_view → ViewSpec (validated)
    F->>T: query_hr_metrics(cube_query) again
    T->>C: /load
    C-->>F: rows for UI
    F-->>W: view_spec + data + frame
    W->>W: ViewRenderer → Recharts / table / map
```

### Step-by-step (code paths)

1. **`web/src/App.tsx`** — Sends `POST /chat` with header `X-Demo-User` (demo auth). Optionally sets `set_active_employee` when the user clicks a table row.
2. **`api/main.py`** — Resolves identity via `get_manager()`, loads `Conversation` from `context.store`, calls `run_turn()`.
3. **`api/agent.py`** — Prepends the **context frame** to the user message, runs the Anthropic tool loop with three tools:
   - `describe_data_model` — field catalog from Cube `/meta`
   - `query_hr_metrics` — optional peek at rows (preview capped at 10)
   - `submit_view` — **terminal**; returns the validated view spec
4. **`api/view_spec.py`** — Pydantic validation of `narrative`, `cube_query`, `view`, optional `frame_update`.
5. **`api/tools.py`** — After `submit_view`, runs the same `cube_query` again to attach **fresh `data`** for the frontend; writes **`audit_log`**.
6. **`web/src/ViewRenderer.tsx`** — Maps `view.type` to Recharts, a hand-built table, or `MapView` (Leaflet).

The agent’s messages and tool results are stored **in memory** per `conversation_id` (`api/context.py`). Production would persist this; the sample does not.

---

## Security model

Security is **layered**. No single layer relies on the LLM behaving well.

```mermaid
flowchart TB
    subgraph Trusted["Trusted (never from LLM)"]
        Header["X-Demo-User → ManagerIdentity.team"]
        JWT["HS256 JWT: { team, exp }"]
    end

    subgraph CubeGate["Cube — primary gate"]
        QR["queryRewrite: employees.team = scope.team"]
        ViewGate["manager_analytics view: no salary, DOB, reason"]
    end

    subgraph DBGate["Postgres — defence in depth"]
        RLS["RLS on employees / absences / events"]
        Roles["cube_reader BYPASSRLS · api_writer INSERT audit only"]
    end

    Header --> JWT
    JWT --> QR
    QR --> ViewGate
    ViewGate --> DBGate
```

### 1. Authentication (`api/auth.py`)

**Sample only:** `X-Demo-User` maps to a fixed `ManagerIdentity` (email + team). Unknown or missing header → **401**, never a default “see all” user.

```text
ava.thompson@example.com  → Engineering
tara.underwood@example.com → Sales
gemma.hale@example.com     → People
```

**Production:** Replace with real SSO; scope comes from directory/HRIS, not env vars or headers the client can forge.

### 2. Scoped Cube token (`api/tools.py`)

For every Cube call, the API mints a short-lived JWT:

```python
payload = {"team": manager.team, "exp": ...}
token = jwt.encode(payload, CUBE_API_SECRET, algorithm="HS256")
```

- There is **no `team` argument** on `query_hr_metrics` for the model to fill in.
- If `manager.team` is empty → `PermissionError` (fail closed).

### 3. Cube `queryRewrite` (`cube/cube.js`)

Every query gets a mandatory filter:

```javascript
query.filters.push({
  member: 'employees.team',
  operator: 'equals',
  values: [securityContext.team],
});
```

If `securityContext.team` is missing → **throw** (no query runs).

### 4. Curated view (`cube/model/views/manager_analytics.yml`)

The agent may only query **`manager_analytics`**. Restricted columns never appear in the view:

| In Postgres | In manager_analytics |
|-------------|----------------------|
| `employees.salary` | omitted |
| `employees.date_of_birth` | omitted |
| `absences.reason` | omitted |

`describe_data_model` returns only fields from this view, so the catalog itself is the allow-list.

### 5. Row-level security (`db/rls.sql`)

RLS policies on `employees`, `absences`, and `employment_events` filter by `current_setting('app.manager_team')`. **Cube uses `cube_reader` with `BYPASSRLS`** because Cube’s connection does not set that session variable; **Cube’s `queryRewrite` is the primary gate** for analytics queries. RLS protects direct SQL from other roles.

### 6. Audit trail

Every successful `query_hr_metrics` inserts into `audit_log` via role **`api_writer`** (INSERT-only on `audit_log`). Failures are logged to stderr but do not block the response.

### 7. Conversation isolation

`ConversationStore.get_or_create` rejects access if the same `conversation_id` was created by a **different** manager email.

### 8. Context frame vs scope

`active_team` in the context frame is a **UI hint** for follow-ups. **Real scope always comes from the JWT**, not from `frame_update`. The agent is instructed not to add team filters to queries (Cube adds them).

---

## Cube semantic layer

Cube sits between the agent and Postgres: it defines **metrics once**, joins cubes, and compiles queries to SQL.

```mermaid
erDiagram
    teams ||--o{ employees : has
    employees ||--o{ absences : takes
    employees ||--o{ employment_events : has

    teams {
        int id PK
        text name
    }
    employees {
        int id PK
        text full_name
        text team via join
        numeric salary "restricted"
    }
    absences {
        int id PK
        date absence_date
        text absence_type
        text reason "restricted"
    }
```

### Cubes

| Cube | File | Purpose |
|------|------|---------|
| `employees` | `cube/model/cubes/employees.yml` | People, team, location, headcount, turnover |
| `absences` | `cube/model/cubes/absences.yml` | Holiday/sick day counts (no `reason` dimension) |
| `employment_events` | `cube/model/cubes/employment_events.yml` | Joiners, leavers |

Example measures (defined once):

- `employees.headcount`, `employees.active_headcount`, `employees.turnover_rate`
- `absences.holiday_days_taken`, `absences.sick_days_taken`
- `employment_events.joiners`

### Manager-facing view

All agent queries target **`manager_analytics`** with prefixed members, e.g.:

- `manager_analytics.full_name`
- `manager_analytics.holiday_days_taken`
- `manager_analytics.latitude` / `longitude` (for maps)

The agent builds a **Cube query object**, not SQL:

```json
{
  "measures": ["manager_analytics.holiday_days_taken"],
  "dimensions": ["manager_analytics.full_name"],
  "timeDimensions": [
    {
      "dimension": "manager_analytics.absence_date",
      "dateRange": ["2025-01-01", "2025-12-31"]
    }
  ]
}
```

`tools.py` normalises bare years (`"2026"` → `["2026-01-01", "2026-12-31"]`) because Cube rejects a lone year string.

### Verifying Cube

With Docker up, open [http://localhost:4000](http://localhost:4000) (Cube Playground). Query `manager_analytics` with a security context that includes `team` (see Cube docs for dev JWT).

---

## Agent and tools

### Tool-use loop (`api/agent.py`)

The model must end with **`submit_view`**. It does not return free-form answers to the user; the UI renders the spec.

| Tool | Who sets scope? | Returns |
|------|-----------------|--------|
| `describe_data_model` | API (JWT) | Measure/dimension catalog |
| `query_hr_metrics` | API (JWT) | Row preview (optional) |
| `submit_view` | N/A | Validated view spec |

System rules include: use only catalog fields, do not add team filters, reuse `cube_query` when switching chart ↔ table, set `frame_update.active_employee` when focusing on one person.

### View spec contract

The agent returns (backend attaches `data`):

```json
{
  "narrative": "Holiday days taken per engineer in 2026.",
  "cube_query": {
    "measures": ["manager_analytics.holiday_days_taken"],
    "dimensions": ["manager_analytics.full_name"],
    "timeDimensions": [
      {
        "dimension": "manager_analytics.absence_date",
        "dateRange": "2026"
      }
    ]
  },
  "view": {
    "type": "bar_chart",
    "x": "manager_analytics.full_name",
    "y": "manager_analytics.holiday_days_taken"
  },
  "frame_update": {
    "active_employee": "Chloe Davies"
  }
}
```

Supported `view.type` values: `bar_chart`, `line_chart`, `pie_chart`, `table`, `stat`, `map`.

### MCP server (`mcp-server/server.py`)

The same two data tools are exposed via **FastMCP** for Claude Code (see `.mcp.json`). Scope comes from `DEMO_MANAGER_SCOPE` in that process’s environment—not from tool arguments.

**Duplication note:** `api/tools.py` mirrors `mcp-server/server.py` so FastAPI does not spawn a subprocess per request. Keep them in sync when changing query or audit behaviour.

---

## Conversation context frame

The frame makes follow-ups work (“How many days did **they** take?”).

```json
{
  "active_employee": "Chloe Davies",
  "active_team": null,
  "date_range": "2026"
}
```

```mermaid
stateDiagram-v2
    [*] --> TeamQuestion: "headcount for my team"
    TeamQuestion --> PersonFocus: click row / name in answer
    PersonFocus --> PersonFollowUp: "how many days did they take?"
    PersonFollowUp --> TeamQuestion: "reset frame" or team-wide question
    TeamQuestion --> [*]: new conversation / switch demo user
```

- Injected into every user message as XML-like text in `agent.py`.
- Shown in the sidebar (`Chat.tsx`); **Reset frame** calls `POST /conversations/reset-frame`.
- Row click in `App.tsx` sets `set_active_employee` and sends a follow-up prompt.

Switching demo user in the UI **clears** the conversation so one manager never inherits another’s thread.

---

## Frontend

| File | Responsibility |
|------|----------------|
| `web/src/App.tsx` | Demo user, chat state, drill-down on row click |
| `web/src/Chat.tsx` | Transcript, context frame display, suggestions |
| `web/src/ViewRenderer.tsx` | Maps view spec → Recharts / table / `MapView` |
| `web/src/MapView.tsx` | Leaflet map (vanilla JS in `useEffect`, not react-leaflet) |
| `web/src/api.ts` | Fetch wrapper + `X-Demo-User` header |
| `web/vite.config.ts` | Dev proxy to FastAPI |

The frontend never talks to Cube directly. It only sees `view_spec` + `data` from the API.

---

## Database

### Tables (`db/schema.sql`)

| Table | Contents |
|-------|----------|
| `teams` | Engineering, Sales, People |
| `employees` | HR records, location, salary (restricted), etc. |
| `absences` | One row per absence day; `reason` restricted |
| `employment_events` | joined / left / role_change |
| `audit_log` | Query audit trail |

### Seed data (`db/seed.sql`)

~40 employees across three teams with realistic absence and employment history for demos.

---

## Local development

### Prerequisites

- Docker
- [uv](https://docs.astral.sh/uv/) (Python 3.12+)
- Node.js 18+
- Anthropic API key

### 1. Environment

```bash
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY and CUBE_API_SECRET
```

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Agent loop |
| `CUBE_API_SECRET` | Sign/verify scoped Cube JWTs (must match Docker) |
| `AUDIT_DB_URL` | `postgresql://api_writer:api@localhost:5432/hr` |

### 2. Infrastructure

```bash
docker compose up -d
# Wait ~10s for Postgres init (schema → rls → seed)
```

### 3. Backend

```bash
cd api
uv sync
uv run uvicorn main:app --reload --port 8000
```

Health check: [http://localhost:8000/health](http://localhost:8000/health) (`anthropic_key_set: true`).

### 4. Frontend

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Example session

1. Sign in as **Ava Thompson (Engineering)**.
2. “What is my team headcount?” → stat.
3. “Show holiday days taken per person in 2025” → bar chart.
4. “Put that in a table instead” → same `cube_query`, `view.type: table`.
5. Click a row → `active_employee` set; ask “How many holiday days have they taken?”
6. **Reset frame** → clears entity focus.

Try switching to **Tara (Sales)** or **Gemma (People)**—metrics only include that team’s rows.

---

## Repository layout

```text
hr_manager/
├── CLAUDE.md              # Project brief and build rules
├── docker-compose.yml     # Postgres + Cube
├── db/
│   ├── schema.sql
│   ├── rls.sql
│   └── seed.sql
├── cube/
│   ├── cube.js            # queryRewrite security
│   └── model/
│       ├── cubes/         # employees, absences, employment_events
│       └── views/         # manager_analytics
├── mcp-server/            # FastMCP tools (dev / Claude Code)
├── api/
│   ├── main.py            # HTTP routes
│   ├── agent.py           # Anthropic tool loop
│   ├── tools.py           # Cube client + audit (runtime)
│   ├── auth.py            # Mock identity
│   ├── context.py         # Conversation store + frame
│   └── view_spec.py       # Pydantic schemas
└── web/                   # React + Vite UI
```

---

## Production gaps (intentional in the sample)

| Area | Sample | Production |
|------|--------|------------|
| Auth | `X-Demo-User` header | SSO / session JWT |
| Conversations | In-memory | Durable store |
| MCP vs API tools | Duplicated modules | Shared package |
| Secrets | `.env` (gitignored) | Secret manager, rotated keys |
| Cube | `CUBEJS_DEV_MODE` | Hardened deployment, monitoring |

---

## Further reading

- **`CLAUDE.md`** — Build phases, contracts, non-negotiable rules.
- **`.claude/skills/`** — `cube-data-model`, `agent-tools`, `permissions-audit` for detailed checklists when changing data access.

For permissions changes, run the **permissions-audit** skill before merging anything under `db/`, `cube/`, `mcp-server/`, or `api/`.
