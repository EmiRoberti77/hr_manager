---
name: cube-data-model
description: Use this skill whenever working with the Cube semantic layer in this project — adding or editing cubes, measures, dimensions, joins, segments, or views, or when a task involves how HR metrics like headcount, turnover, or holiday days are defined. Trigger this even if the user only mentions "the data model", "a new metric", "a measure", or changing what the app can report on. Defining metrics correctly and once is core to this app's trustworthiness, so always consult this skill before touching anything under cube/.
---

# Cube data model

The Cube model is the semantic layer: it describes what the HR data *means*,
independent of the database tables and independent of any chart. It is the
single source of truth for every metric in the app.

## Where the model lives

```
cube/model/
├── cubes/     one .yml per cube (employees, absences, employment_events)
└── views/     curated, manager-facing surfaces (manager_analytics.yml)
```

## The golden rule

Every metric is a **measure**, defined once, here. The agent and the frontend
never compute an aggregation themselves. If "holiday days taken" lived in three
places it could return three answers — defining it once is what makes the app
trustworthy.

## Adding a cube

A cube wraps a table or a SQL query. It does not copy data. Inside it you define
dimensions (things you slice/filter by) and measures (things you aggregate).

```yaml
cubes:
  - name: employees
    sql_table: hr.employees
    joins:
      - name: absences
        sql: "{CUBE}.id = {absences}.employee_id"
        relationship: one_to_many
    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true
      - name: full_name
        sql: full_name
        type: string
      - name: team
        sql: team_name
        type: string
      - name: role
        sql: job_title
        type: string
      - name: start_date
        sql: start_date
        type: time
    measures:
      - name: headcount
        type: count
```

## Adding a measure

Pick the simplest `type` that is correct (`count`, `sum`, `avg`,
`count_distinct`). Use `filters` to scope a measure to a subset of rows.

```yaml
measures:
  - name: holiday_days_taken
    sql: days
    type: sum
    filters:
      - sql: "{CUBE}.type = 'holiday'"
```

## Calculated measures

A metric derived from other measures references them with `{measure_name}`.

```yaml
measures:
  - name: leavers
    type: count
    filters:
      - sql: "{CUBE}.end_date IS NOT NULL"
  - name: turnover_rate
    sql: "{leavers} / NULLIF({headcount}, 0)"
    type: number
    format: percent
```

## Segments

A segment is a named, reusable filter — handy for common slices.

```yaml
segments:
  - name: is_active
    sql: "{CUBE}.end_date IS NULL"
```

## Views — the manager-facing surface

A view bundles a curated set of measures and dimensions and is what the agent is
allowed to query. **Restricted fields must never be added to the manager view.**
Keep sickness reasons, salary, and protected characteristics out of it — that is
how the app enforces rule 6, not by asking the agent to behave.

```yaml
views:
  - name: manager_analytics
    cubes:
      - join_path: employees
        includes: [full_name, team, role, headcount, turnover_rate]
      - join_path: employees.absences
        includes: [holiday_days_taken, absence_date]
```

## Security context — the part that must be right

Every cube containing employee rows must be filtered by the logged-in manager's
scope. Cube does this with a query-rewrite rule that reads the **security
context** — an object the trusted backend attaches to the request. The agent
never sets it.

```javascript
// cube/cube.js
module.exports = {
  queryRewrite: (query, { securityContext }) => {
    if (!securityContext || !securityContext.team) {
      throw new Error('No manager scope on request — refusing to query.');
    }
    query.filters.push({
      member: 'employees.team',
      operator: 'equals',
      values: [securityContext.team],
    });
    return query;
  },
};
```

Fail closed: if there is no scope, refuse the query. Never default to "all".

## Verifying a model change

Run the stack (`docker compose up -d`) and open the Cube Playground at
`http://localhost:4000`. Build each query the app needs to support and confirm
the numbers are right. Then test the security context by issuing the same query
with two different scoped tokens — each manager must see only their own team.

## Before you finish

- Every new metric is a single measure, not logic duplicated elsewhere.
- Restricted fields are absent from `manager_analytics`.
- `queryRewrite` still fails closed when no scope is present.
- Cube config syntax was checked against current Cube docs, not memory — Cube
  has renamed these concepts before (schema → data model, JS → YAML).
