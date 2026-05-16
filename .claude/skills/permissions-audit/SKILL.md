---
name: permissions-audit
description: Use this skill before completing or merging ANY change that touches data access, queries, authentication, or the agent — that is, anything under db/, cube/, mcp-server/, or the agent code in api/. It verifies the manager's security scope is enforced in the data layer and never by the agent. Trigger this proactively whenever a change could affect who can see which HR data, even if the user did not explicitly ask for a security review. HR data is sensitive, so this check is mandatory, not optional.
---

# Permissions audit

HR data is sensitive — it includes absence records and, in a real deployment,
salary and special-category data. The safety property this app depends on:

> A manager only ever receives data for their own scope, and that limit is
> enforced *below* the agent — in the data layer — so no prompt can widen it.

Run this checklist before marking complete any change under `db/`, `cube/`,
`mcp-server/`, or the agent code in `api/`. Produce a short pass/fail report.
**If any item fails, the task is not done.**

## The checklist

**1. Scope comes from the session, never the LLM.**
The manager's team scope must originate from authenticated session identity and
be attached by the trusted backend. Verify no tool, no agent prompt, and no view
spec carries a `scope`, `team`, `manager_id`, or `view_as` field the agent fills.
Red flag: any tool signature where the model supplies who it is querying as.

**2. Cube enforces the scope on every employee-bearing cube.**
Check `cube/cube.js` `queryRewrite`: it must inject the scope filter and must
**fail closed** — throw, not default to "all" — when no security context is
present. Confirm every cube with employee rows is covered.

**3. Postgres row-level security is on, as defence in depth.**
`db/rls.sql` enables RLS on `employees`, `absences`, and `employment_events`.
This is a second layer; it does not replace check 2.

**4. The agent has no SQL path and no database connection.**
Confirm the agent and the MCP tools never accept a raw SQL string and the agent
process holds no DB credentials. Its only data route is `query_hr_metrics` →
Cube. Red flag: a `psycopg`/database import anywhere in the agent or MCP code.

**5. Restricted fields are out of the manager-facing view.**
Sickness reasons, salary beyond scope, and protected characteristics must be
absent from the `manager_analytics` Cube view — excluded at the model, not
merely hidden in the UI and not left to the agent to refuse.

**6. Every query is audit-logged.**
Each query writes a row to `audit_log`: manager id, the query, the scope it ran
under, and a timestamp. Verify the log write is on the path that *every* query
takes, not an optional branch.

**7. Column masking by role where required.**
Where a field is visible to some roles only, confirm masking is applied in the
Cube model or the database, keyed to session role — not in frontend code.

## How to run the audit

```bash
# scope must never be an LLM-supplied tool argument
grep -rniE "scope|team|manager_id|view_as" mcp-server/ api/agent.py

# the agent must hold no direct DB access
grep -rniE "psycopg|asyncpg|sqlalchemy|DATABASE_URL" api/agent.py mcp-server/

# the scope filter must fail closed
grep -n "queryRewrite" -A 15 cube/cube.js
```

Read the matches in context — `grep` flags candidates, judgement confirms them.

## Report format

```
Permissions audit — <change being reviewed>
1. Scope from session ............ PASS / FAIL — <evidence>
2. Cube queryRewrite enforced .... PASS / FAIL — <evidence>
3. Postgres RLS enabled .......... PASS / FAIL — <evidence>
4. No agent SQL path ............. PASS / FAIL — <evidence>
5. Restricted fields excluded .... PASS / FAIL — <evidence>
6. Audit logging on every query .. PASS / FAIL — <evidence>
7. Column masking by role ........ PASS / FAIL / N/A — <evidence>

Result: <SAFE TO MERGE / DO NOT MERGE — fix items N, M>
```

State failures plainly and stop. Do not soften a FAIL into a warning.
