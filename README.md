# HR Platform — Architecture & Guide

A sample **HR platform** with four capabilities:

1. **Analytics** — managers ask questions in plain language and receive dynamic charts, tables, and maps (Cube + agent).
2. **Training** — HR admins publish YouTube-based courses and assign them to teams; managers track completion.
3. **Policies** — HR admins upload team-scoped PDF handbooks; managers query them via a **RAG chatbot** with citations.
4. **Expenses** — employees photograph receipts; Claude vision extracts line items; they review and submit expenses linked to their account.

Analytics is **read-only** (the agent never writes HR data or executes arbitrary SQL). Training, Policies, and Expenses use direct Postgres access with their own security models.

This document explains how the code works: services, data flows, security boundaries, and each module’s architecture.

---

## What you get

| Capability | Example prompt |
|------------|----------------|
| Team metrics | “What is my team headcount?” → stat |
| Comparisons | “Show holiday days taken per person in 2025” → bar chart |
| View switching | “Put that in a table instead” → same query, different view |
| Drill-down | Click a name in a table → follow-up about that person |
| Geography | “Where is my team based?” → map with pins |
| **Training** | HR admin uploads YouTube courses, assigns to teams; managers watch and mark completion |
| **Policies (RAG)** | HR admin uploads PDFs per team; managers ask “What is the holiday entitlement?” and get cited answers |
| **Expenses** | Employee uploads receipt photo → LLM extracts items → review and submit |

Demo **managers** (Engineering, Sales, People) see only their team for analytics and policies. **Employees** submit expenses from their phone. **HR admin** manages training and policy uploads across teams.

### Demo accounts

Pick a user from the header dropdown. `GET /demo-users` returns `role` and `employee_id` (linked to `employees.email` in the seed data).

| Email | Team | Role | Can upload expenses |
|-------|------|------|---------------------|
| `ava.thompson@example.com` | Engineering | manager | Yes (also an employee record) |
| `tara.underwood@example.com` | Sales | manager | Yes |
| `gemma.hale@example.com` | People | manager | Yes |
| `hr.admin@example.com` | People | hr_admin | No (view only) |
| `chloe.davies@example.com` | Engineering | employee | Yes |
| `umar.vance@example.com` | Sales | employee | Yes |
| `maya.north@example.com` | People | employee | Yes |

### Platform overview

```mermaid
flowchart TB
    subgraph UI["Web — React + Vite (localhost:5173)"]
        Analytics["/ — Chat + ViewRenderer"]
        Training["/training — courses & enrollments"]
        Policies["/policies — PDF library & RAG chat"]
        Expenses["/expenses — receipt upload & review"]
    end

    subgraph API["FastAPI (localhost:8000)"]
        Auth["auth.py — X-Demo-User → identity"]
        Agent["agent.py — analytics tool loop"]
        TrainAPI["training.py"]
        PolicyAPI["policies.py"]
        ExpAPI["expenses.py"]
    end

    subgraph DataPaths["Data paths"]
        Cube["Cube :4000 — semantic layer"]
        PG["Postgres :5432 — HR + training + policies + expenses"]
        OpenAI["OpenAI — policy embeddings"]
        Claude["Anthropic — analytics + policy + receipt vision"]
    end

    Analytics --> Auth --> Agent --> Cube --> PG
    Training --> Auth --> TrainAPI --> PG
    Policies --> Auth --> PolicyAPI --> PG
    Expenses --> Auth --> ExpAPI --> PG
    PolicyAPI --> OpenAI
    Agent --> Claude
    PolicyAPI --> Claude
    ExpAPI --> Claude
```

---

## High-level architecture (Analytics)

The analytics stack has five layers. A prompt flows **down**; a rendered view flows **back up**. Training and Policies are **separate** from this path (see sections below).

```mermaid
flowchart TB
    subgraph UI["Web — Analytics route"]
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

    subgraph Data["PostgreSQL 16 + pgvector (Docker)"]
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
| **PostgreSQL** (`pgvector/pgvector:pg16`) | `5432` | HR data, training, policy chunks (vectors), RLS |
| **Cube** | `4000` | REST API, Playground, query compilation |
| **Cube SQL API** | `5433` | Optional direct SQL port (dev) |
| **FastAPI** | `8000` | Analytics chat, training, policies, expenses, demo users |
| **Vite (React)** | `5173` | UI; proxies `/chat`, `/training`, `/policies`, `/expenses` to FastAPI |

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
    API -->|OpenAI embeddings| OpenAI["OpenAI API"]
```

### Docker Compose

`docker-compose.yml` starts Postgres and Cube:

- Postgres image: **`pgvector/pgvector:pg16`** (required for policy embeddings).
- Init scripts in order: `01-schema` → `02-rls` → `03-seed` → `04-training` → `05-policies` → `05-hr-admin-employees-rls` → `06-expenses` (see [`docker-compose.yml`](docker-compose.yml)).
- Cube mounts `cube/model/` and `cube/cube.js`, connects as **`cube_reader`** (not the table owner, so misconfiguration is visible).
- Upload directories (gitignored): `data/policy_uploads/` (PDFs), `data/expense_receipts/` (receipt photos).

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
ava.thompson@example.com   → Engineering (manager + employee)
tara.underwood@example.com → Sales (manager + employee)
gemma.hale@example.com     → People (manager + employee)
hr.admin@example.com       → People (HR admin — no employee row)
chloe.davies@example.com   → Engineering (employee)
umar.vance@example.com   → Sales (employee)
maya.north@example.com   → People (employee)
```

Each request enriches identity with **`employee_id`** from `employees.email` ([`api/expenses_db.py`](api/expenses_db.py) `lookup_employee_id`). That lookup runs server-side only (uses a trusted HR-admin RLS session for the read — `api_writer` cannot otherwise see all employees).

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
| `web/src/Router.tsx` | Routes: `/`, `/training`, `/policies`, `/expenses` |
| `web/src/Layout.tsx` | Top nav + demo user picker (shows role) |
| `web/src/App.tsx` | Analytics: chat state, drill-down on row click |
| `web/src/Chat.tsx` | Transcript, context frame display, suggestions |
| `web/src/ViewRenderer.tsx` | Maps view spec → Recharts / table / `MapView` |
| `web/src/TrainingPage.tsx` | Training UI |
| `web/src/PoliciesPage.tsx` | Policy library + RAG chat |
| `web/src/ExpensesPage.tsx` | Receipt upload (mobile camera), review, submit |
| `web/src/api.ts` | Analytics API client + `DemoUser` type |
| `web/src/trainingApi.ts` | Training API client |
| `web/src/policiesApi.ts` | Policies API client |
| `web/src/expensesApi.ts` | Expenses API client |
| `web/vite.config.ts` | Dev proxy to FastAPI |

The analytics frontend never talks to Cube directly. It only sees `view_spec` + `data` from the API. Training, Policies, and Expenses call their own REST endpoints with the same `X-Demo-User` header.

**Note:** Edit the `.tsx` sources under `web/src/` — do not add parallel `.js` copies; Vite resolves `.js` before `.tsx` if both exist.

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

~40 employees across three teams with realistic absence and employment history for demos. Demo login emails match employee rows where expenses are tested (e.g. `chloe.davies@example.com`).

### Extension tables (migrations)

| Migration | Adds |
|-----------|------|
| `001_training.sql` | `training_courses`, `training_videos`, `training_enrollments` |
| `002_hr_admin_employees_rls.sql` | HR admin can read all `employees` (assignment fan-out) |
| `002_policies.sql` | `policy_documents`, `policy_chunks` (pgvector), chat + audit tables |
| `003_expenses.sql` | `expenses`, `expense_line_items` |

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
| `ANTHROPIC_API_KEY` | Analytics agent, policy RAG answers, receipt vision extraction |
| `OPENAI_API_KEY` | Policy document embeddings (`text-embedding-3-small`) |
| `CUBE_API_SECRET` | Sign/verify scoped Cube JWTs (must match Docker) |
| `AUDIT_DB_URL` | `postgresql://api_writer:api@localhost:5432/hr` (audit, training, policies, expenses) |
| `POLICY_UPLOAD_DIR` | Optional; defaults to `data/policy_uploads/` |
| `EXPENSE_UPLOAD_DIR` | Optional; defaults to `data/expense_receipts/` |

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

Health check: [http://localhost:8000/health](http://localhost:8000/health) (`anthropic_key_set`, `openai_key_set`). Policy-specific: [http://localhost:8000/policies/health](http://localhost:8000/policies/health) (`pgvector_ok`).

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

### Migrations (existing databases)

Fresh `docker compose up` runs all init scripts automatically. If Postgres was already initialized **before** training or policies were added, apply migrations manually (Postgres must have the **pgvector** extension — use the `pgvector/pgvector:pg16` image):

```bash
docker exec -i hr-postgres psql -U hr -d hr < db/migrations/001_training.sql
docker exec -i hr-postgres psql -U hr -d hr < db/migrations/002_hr_admin_employees_rls.sql
docker exec -i hr-postgres psql -U hr -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker exec -i hr-postgres psql -U hr -d hr < db/migrations/002_policies.sql
docker exec -i hr-postgres psql -U hr -d hr < db/migrations/003_expenses.sql
```

Or recreate the volume: `docker compose down -v && docker compose up -d`.

### Training demo flow

1. Sign in as **hr.admin@example.com** → **Training** tab.
2. Create a course (e.g. “Enrollment basics”) and paste a YouTube URL.
3. Assign the course to the **Engineering** team.
4. Switch to **ava.thompson@example.com** → Training → see team enrollments, watch videos, mark **Start** / **Complete**.
5. **tara.underwood@example.com** cannot create courses and does not see Engineering enrollments.

### Policies demo flow

1. Sign in as **hr.admin@example.com** → **Policies** tab.
2. Upload a text-based PDF (e.g. sickness or holiday policy), set **team** (e.g. Engineering) and **category**.
3. Wait for status **ready** (background ingest: extract → chunk → embed).
4. Switch to **ava.thompson@example.com** (Engineering) → ask *“What is the sickness absence policy?”* → answer with **Sources**.
5. **tara.underwood@example.com** (Sales) does not retrieve Engineering policy chunks.

### Expenses demo flow

1. Sign in as **chloe.davies@example.com** (employee) → **Expenses**.
2. Tap **Upload receipt**, take or select a photo → wait for `draft`.
3. Review line items and total → **Confirm & submit**.
4. Sign in as **ava.thompson@example.com** (manager) → see Chloe's submitted expense in the team list.
5. **hr.admin@example.com** → sees all teams; cannot upload (no employee record).

---

## HR Training module

Training is a **separate vertical** from analytics: direct FastAPI CRUD + Postgres, not the agent or Cube.

```mermaid
flowchart LR
    HRAdmin["hr.admin@example.com"]
    Manager["Team manager"]
    API["api/training.py"]
    PG["training_* tables"]

    HRAdmin -->|create courses, assign| API
    Manager -->|view enrollments, update status| API
    API --> PG
```

| Table | Purpose |
|-------|---------|
| `training_courses` | Course metadata (title, category, description) |
| `training_videos` | YouTube links per course |
| `training_enrollments` | Per-employee assignment + status |

**Roles:**

- **HR admin** — full CRUD on courses/videos; assign to any team or individuals.
- **Managers** — view enrollments for their team only; update status (`not_started` → `in_progress` → `completed`).

**Security:** Team scope for enrollments is enforced via Postgres RLS (`app.manager_team`) for managers and session flag `app.is_hr_admin` for HR admin. Training mutations are never exposed to the LLM.

**API routes:** `GET/POST /training/courses`, `POST /training/courses/{id}/videos`, `POST /training/assignments`, `GET/PATCH /training/enrollments`, etc.

---

## Policy documents (RAG)

Policies let managers query uploaded HR PDFs (holiday, expenses, travel, safety, etc.) in natural language. This module is **intentionally separate** from the Cube analytics agent: no view specs, no SQL from the LLM, no Cube path.

```mermaid
flowchart TB
    subgraph Upload["Upload — HR admin only"]
        UI1["PoliciesPage — multipart form"]
        API1["POST /policies/documents"]
        PDF["policy_ingest.py — pypdf extract"]
        Chunk["tiktoken chunk ~500 tokens"]
        Emb["OpenAI text-embedding-3-small"]
        DB[(policy_documents + policy_chunks)]
        UI1 --> API1 --> PDF --> Chunk --> Emb --> DB
    end

    subgraph Query["Query — any manager"]
        UI2["PoliciesPage — chat panel"]
        API2["POST /policies/chat"]
        Ret["policy_rag.py — pgvector cosine search"]
        LLM["Claude — answer + citations"]
        Audit["policy_query_log"]
        UI2 --> API2 --> Ret --> DB
        Ret --> LLM
        API2 --> Audit
    end
```

### Policy chat sequence

```mermaid
sequenceDiagram
    participant U as Manager (browser)
    participant F as FastAPI
    participant R as policy_rag.py
    participant O as OpenAI
    participant P as Postgres
    participant C as Anthropic

    U->>F: POST /policies/chat<br/>message, conversation_id
    F->>F: get_manager() → team scope
    F->>R: retrieve_chunks(query)
    R->>O: embed query
    O-->>R: vector
    R->>P: SELECT … WHERE d.team = manager.team<br/>ORDER BY embedding <=> query
    P-->>R: top-k chunks
    R->>C: messages + policy excerpts
    C-->>R: answer
    R->>P: INSERT policy_chat_messages, policy_query_log
    R-->>F: answer + sources
    F-->>U: JSON response
```

### Data model

| Table | Purpose |
|-------|---------|
| `policy_documents` | PDF metadata, `team`, `category`, `status` (`processing` / `ready` / `failed`) |
| `policy_chunks` | Text segments + `vector(1536)` embedding |
| `policy_chat_messages` | Per-conversation history (survives refresh) |
| `policy_query_log` | Audit: who asked, team scope, chunk ids |

### Security (team-scoped)

```mermaid
flowchart LR
    subgraph Trusted["Trusted session"]
        Auth["X-Demo-User → ManagerIdentity.team"]
        Sess["SET LOCAL app.manager_team"]
    end

    subgraph Retrieval["Retrieval — fail closed"]
        SQL["WHERE d.team = %s<br/>bound from manager.team only"]
        RLS["RLS on documents + chunks"]
    end

    Auth --> Sess --> SQL --> RLS
```

| Rule | Implementation |
|------|----------------|
| Upload / delete | `require_hr_admin()` only |
| Chat | Any manager; retrieval filtered by **their** team |
| Team on upload | HR admin chooses team tag; does **not** widen search for other managers |
| No LLM scope | Chat body has no `team` field for vector search |
| Audit | Every `/policies/chat` writes `policy_query_log` |

**API routes:** `GET /policies/documents`, `POST /policies/documents` (multipart PDF), `DELETE /policies/documents/{id}`, `POST /policies/chat`, `GET /policies/health`.

**Code:** `api/policies.py`, `api/policies_db.py`, `api/policy_ingest.py`, `api/policy_rag.py`, `web/src/PoliciesPage.tsx`, `web/src/policiesApi.ts`.

**Limits (v1):** text-based PDFs only (no OCR for scans); one team per document; no integration with the analytics chat on `/`.

---

## Employee expenses (receipt upload)

Employees upload receipt **photos** from their phone (`<input capture="environment">` on mobile). Claude **vision** extracts merchant, date, line items, and total. The employee reviews the draft and submits; the expense is stored against their `employees` row.

### Status workflow

```mermaid
stateDiagram-v2
    [*] --> processing: POST /expenses/receipts
    processing --> draft: Claude vision OK
    processing --> failed: extract error
    draft --> submitted: POST /expenses/id/submit
    failed --> [*]: DELETE
    draft --> [*]: DELETE
    submitted --> [*]: read-only for managers
```

### End-to-end flow

```mermaid
sequenceDiagram
    participant U as Employee (browser)
    participant F as FastAPI
    participant V as Claude vision
    participant P as Postgres

    U->>F: POST /expenses/receipts (multipart image)
    F->>F: employee_id from session email
    F->>P: INSERT expenses status=processing
    F-->>U: 201 expense id

    F->>V: extract_receipt (base64 image)
    V-->>F: merchant, line_items, total
    F->>P: UPDATE draft + expense_line_items

    U->>F: PATCH /expenses/id (optional edits)
    U->>F: POST /expenses/id/submit
    F->>P: status=submitted
```

```mermaid
flowchart TB
    subgraph Upload["Upload — employee only"]
        Phone["ExpensesPage — camera input"]
        API["POST /expenses/receipts"]
        Store["data/expense_receipts/"]
        Vision["expense_extract.py — Claude vision"]
        DB[(expenses + expense_line_items)]
        Phone --> API --> Store --> Vision --> DB
    end

    subgraph Confirm["Review and submit"]
        UI2["Edit line items + total"]
        Submit["POST /expenses/id/submit"]
        UI2 --> Submit --> DB
    end
    Vision --> UI2
```

### Data model

| Table | Purpose |
|-------|---------|
| `expenses` | Receipt metadata, status, merchant, total, `extraction_raw` JSON |
| `expense_line_items` | Itemized lines (description, qty, amount) |

### Security

| Rule | Implementation |
|------|----------------|
| Submit | `employee_id` resolved from session email → `employees` table; never from request body |
| View own | RLS + `app.employee_id` session var |
| Manager view | Team-scoped `SELECT` via `app.manager_team` |
| HR admin | Full read via `app.is_hr_admin` |
| Edit/submit | Own `draft` rows only; managers read-only |

**API routes:** `GET /expenses`, `GET /expenses/{id}`, `POST /expenses/receipts`, `PATCH /expenses/{id}`, `POST /expenses/{id}/submit`, `DELETE /expenses/{id}`.

**Code:** [`api/expenses.py`](api/expenses.py), [`api/expenses_db.py`](api/expenses_db.py), [`api/expense_extract.py`](api/expense_extract.py), [`web/src/ExpensesPage.tsx`](web/src/ExpensesPage.tsx), [`web/src/expensesApi.ts`](web/src/expensesApi.ts).

**Limits (v1):** images only (JPEG/PNG/WebP, max 10 MB); no manager approval workflow; no PDF receipts; monetary amounts may serialize as strings in JSON — the UI normalizes them before display.

### Troubleshooting (expenses)

| Symptom | Fix |
|---------|-----|
| No **Upload receipt** button | Hard-refresh the page. Check `GET /demo-users` shows `employee_id` for your user. If null, apply `003_expenses.sql` and ensure Postgres is running. |
| `relation "expenses" does not exist` | Run `db/migrations/003_expenses.sql` on the DB. |
| Page crashes after upload | Ensure you are on `ExpensesPage.tsx` (not a stale `ExpensesPage.js`). Amounts from the API are coerced with `formatAmount()`. |

---

## Repository layout

```text
hr_manager/
├── CLAUDE.md              # Project brief and build rules
├── docker-compose.yml     # Postgres + Cube
├── db/
│   ├── schema.sql
│   ├── rls.sql
│   ├── seed.sql
│   └── migrations/
│       ├── 001_training.sql
│       ├── 002_policies.sql
│       ├── 002_hr_admin_employees_rls.sql
│       └── 003_expenses.sql
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
│   ├── auth.py            # Mock identity, roles, employee_id lookup
│   ├── context.py         # Conversation store + frame
│   ├── training.py        # Training REST API
│   ├── training_db.py     # Postgres access for training
│   ├── policies.py        # Policy upload + RAG chat REST API
│   ├── policies_db.py     # Postgres session vars for policy RLS
│   ├── policy_ingest.py   # PDF extract, chunk, OpenAI embed
│   ├── policy_rag.py      # Vector retrieval + Claude answers
│   ├── expenses.py        # Expense upload + review REST API
│   ├── expenses_db.py     # Postgres session vars for expense RLS
│   ├── expense_extract.py # Claude vision receipt parsing
│   ├── youtube.py         # YouTube URL parser
│   └── view_spec.py       # Pydantic schemas
├── data/
│   ├── policy_uploads/    # Uploaded PDFs (gitignored)
│   └── expense_receipts/  # Receipt images (gitignored)
└── web/                   # React + Vite (Analytics, Training, Policies, Expenses)
```

---

## Production gaps (intentional in the sample)

| Area | Sample | Production |
|------|--------|------------|
| Auth | `X-Demo-User` header | SSO / session JWT |
| Conversations | Analytics in-memory; policy chat in Postgres | Durable store everywhere |
| Policy PDFs | Local disk `data/policy_uploads/` | Object storage (S3, etc.) |
| Receipt images | Local disk `data/expense_receipts/` | Object storage (S3, etc.) |
| Embeddings | OpenAI API | Managed embedding service / self-hosted |
| MCP vs API tools | Duplicated modules | Shared package |
| Secrets | `.env` (gitignored) | Secret manager, rotated keys |
| Cube | `CUBEJS_DEV_MODE` | Hardened deployment, monitoring |

---

## Further reading

- **`CLAUDE.md`** — Build phases, contracts, non-negotiable rules.
- **`.claude/skills/`** — `cube-data-model`, `agent-tools`, `permissions-audit` for detailed checklists when changing data access.

For permissions changes, run the **permissions-audit** skill before merging anything under `db/`, `cube/`, `mcp-server/`, or analytics agent code in `api/`. Policy, training, and expense modules use Postgres RLS and session-scoped filters instead of Cube—verify scope never comes from LLM or client-supplied parameters.
