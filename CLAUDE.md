# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A multi-module HR platform with four capabilities:
1. **Analytics** — Conversational AI for HR metrics (Cube + Anthropic agent)
2. **Training** — YouTube-based courses with team assignments
3. **Policies** — RAG-powered PDF document search
4. **Expenses** — Receipt upload with AI extraction (Claude vision)

## Core Architecture Principles

### Non-negotiable Security Rules
1. **No raw SQL from LLM** — Agent emits structured Cube queries only
2. **Permissions in data layer** — Team scope via Cube JWT + Postgres RLS, never from agent
3. **View specs, not code** — Agent returns declarative JSON, no JSX/HTML generation
4. **Single metric definitions** — All measures defined once in Cube model
5. **Full audit logging** — Every query logged with user, scope, timestamp
6. **Model-level data gating** — Sensitive fields excluded from views, not by prompt

## Development Commands

### Prerequisites
```bash
# Install dependencies
brew install uv        # Python package manager
brew install node      # Node.js 18+

# Set up environment
cp .env.example .env
# Edit .env and add:
# - ANTHROPIC_API_KEY
# - OPENAI_API_KEY (for policy embeddings)
# - CUBE_API_SECRET (keep default for local dev)
```

### Start Services
```bash
# Infrastructure (Postgres + Cube)
docker compose up -d

# Backend API (port 8000)
cd api && uv sync && uv run uvicorn main:app --reload

# Frontend (port 5173)
cd web && npm install && npm run dev
```

### Common Tasks
```bash
# Backend linting
cd api && uv run ruff check . --fix
cd api && uv run ruff format .

# Frontend type checking
cd web && npm run typecheck

# View Cube Playground
open http://localhost:4000

# Test MCP tools
cd mcp-server && uv run mcp describe_data_model

# Database access
docker exec -it hr-postgres psql -U hr -d hr

# View logs
docker logs hr-postgres -f
docker logs hr-cube -f
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | FastAPI, Python 3.12+, managed with `uv` |
| Agent | Anthropic SDK with tool-use loop |
| Semantic Layer | Cube (Docker) with queryRewrite security |
| Database | PostgreSQL 16 + pgvector extension |
| Frontend | React + Vite, TypeScript, Recharts, TanStack Table |
| MCP Server | FastMCP for development tool access |

## Key Files & Modules

### Analytics Flow
- `api/agent.py` — Anthropic tool loop, context frame handling
- `api/tools.py` — Cube client with JWT scoping, audit logging
- `cube/cube.js` — queryRewrite team filter enforcement
- `cube/model/views/manager_analytics.yml` — Curated view (no salary/DOB/reason)
- `web/src/ViewRenderer.tsx` — Maps view specs to charts/tables

### Training Module
- `api/training.py` — CRUD endpoints for courses/enrollments
- `api/training_db.py` — RLS session setup for team scoping
- `web/src/TrainingPage.tsx` — Course management UI

### Policies (RAG)
- `api/policy_ingest.py` — PDF extraction, chunking, embedding
- `api/policy_rag.py` — Vector search + Claude answers
- `api/policies_db.py` — Team-scoped retrieval

### Expenses
- `api/expense_extract.py` — Claude vision receipt parsing
- `api/expenses.py` — Upload/review/submit endpoints
- `web/src/ExpensesPage.tsx` — Mobile-friendly receipt capture

## Security Model

```
X-Demo-User header → ManagerIdentity (team)
       ↓
JWT { team, exp } signed with CUBE_API_SECRET
       ↓
Cube queryRewrite: employees.team = scope.team
       ↓
manager_analytics view (excludes salary, DOB, reason)
       ↓
Postgres RLS policies (defense in depth)
```

### Demo Users
| Email | Team | Role | Features |
|-------|------|------|----------|
| `ava.thompson@example.com` | Engineering | manager | All features |
| `tara.underwood@example.com` | Sales | manager | All features |
| `gemma.hale@example.com` | People | manager | All features |
| `hr.admin@example.com` | People | hr_admin | Course/policy admin |
| `chloe.davies@example.com` | Engineering | employee | Expense submission |

## Data Access Patterns

### Analytics (Cube path)
- Tools: `describe_data_model`, `query_hr_metrics`, `submit_view`
- Scope: Set by API via JWT, not tool arguments
- Query: Agent builds Cube query object → Cube compiles SQL

### Training/Policies/Expenses (Direct Postgres)
- Session variables: `app.manager_team`, `app.employee_id`, `app.is_hr_admin`
- RLS policies filter by team/employee
- No LLM involvement in query generation

## Development Guidelines

1. **Python**: Type hints everywhere, format with `ruff`
2. **TypeScript**: Strict mode enabled, run `npm run typecheck`
3. **Secrets**: Use environment variables, never commit `.env`
4. **Cube queries**: Always use `manager_analytics` view prefix
5. **Time ranges**: Normalize years to `["YYYY-01-01", "YYYY-12-31"]`
6. **Audit**: Every data query must write to `audit_log`
7. **File edits**: Prefer editing `.tsx` files over creating `.js` copies

## Testing Workflows

### Analytics Chat
1. Sign in as Ava Thompson (Engineering)
2. "What is my team headcount?" → stat view
3. "Show holiday days per person in 2025" → bar chart
4. Click a name → sets `active_employee`
5. "How many days did they take?" → follow-up query

### Training Flow
1. Sign in as `hr.admin@example.com`
2. Create course with YouTube URL
3. Assign to Engineering team
4. Switch to `ava.thompson@example.com`
5. Mark course as completed

### Policy RAG
1. Upload PDF as HR admin with team scope
2. Switch to team manager
3. Ask "What is the holiday policy?"
4. Verify only team-scoped documents retrieved

### Expense Submission
1. Sign in as `chloe.davies@example.com`
2. Upload receipt photo
3. Review extracted items
4. Submit expense
5. View as manager

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `relation "expenses" does not exist` | Run migration: `docker exec -i hr-postgres psql -U hr -d hr < db/migrations/003_expenses.sql` |
| No cube data | Wait for Postgres health check, verify `cube_reader` role exists |
| Policy upload fails | Check `OPENAI_API_KEY` is set, verify pgvector extension |
| Expense extraction empty | Verify `ANTHROPIC_API_KEY`, check image format (JPEG/PNG/WebP) |

## Production Considerations

**This is a sample app. Production needs:**
- Replace `X-Demo-User` with real SSO
- Move from local file storage to S3
- Implement proper secret rotation
- Add rate limiting and monitoring
- Persist conversation state
- Remove `CUBEJS_DEV_MODE`
- Implement approval workflows for expenses