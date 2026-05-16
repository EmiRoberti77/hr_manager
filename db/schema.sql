-- HR Analytics — schema
-- Five tables: teams, employees, absences, employment_events, audit_log.
-- Restricted fields (e.g. absence reason) live here but are excluded from the
-- manager-facing Cube view; the data layer is the security boundary, not the
-- agent.

CREATE TABLE teams (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    cost_centre TEXT NOT NULL
);

CREATE TABLE employees (
    id            SERIAL PRIMARY KEY,
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    team_id       INTEGER NOT NULL REFERENCES teams(id),
    role          TEXT NOT NULL,
    start_date    DATE NOT NULL,
    end_date      DATE,
    -- Location — safe to expose in manager_analytics view.
    location_city    TEXT,
    location_country TEXT,
    latitude         NUMERIC(9,6),
    longitude        NUMERIC(9,6),
    -- Broad pay band (not specific salary) — safe to expose.
    salary_band      TEXT,
    -- Restricted: not exposed in manager_analytics view.
    salary        NUMERIC(10,2),
    date_of_birth DATE
);

CREATE INDEX employees_team_id_idx ON employees(team_id);
CREATE INDEX employees_active_idx ON employees(end_date) WHERE end_date IS NULL;

-- Absences: one row per absence day. Keeps holiday_days_taken a simple COUNT,
-- and makes time-dimension queries in Cube straightforward.
CREATE TABLE absences (
    id            SERIAL PRIMARY KEY,
    employee_id   INTEGER NOT NULL REFERENCES employees(id),
    absence_date  DATE NOT NULL,
    absence_type  TEXT NOT NULL CHECK (absence_type IN ('holiday', 'sick', 'other')),
    -- Restricted: never exposed in manager_analytics view.
    reason        TEXT,
    UNIQUE (employee_id, absence_date)
);

CREATE INDEX absences_employee_idx ON absences(employee_id);
CREATE INDEX absences_date_idx ON absences(absence_date);

-- Joiners / leavers / role changes drive turnover and headcount-over-time.
CREATE TABLE employment_events (
    id          SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    event_type  TEXT NOT NULL CHECK (event_type IN ('joined', 'left', 'role_change')),
    event_date  DATE NOT NULL,
    detail      TEXT
);

CREATE INDEX employment_events_employee_idx ON employment_events(employee_id);
CREATE INDEX employment_events_date_idx ON employment_events(event_date);

-- Every query through the agent is logged here. Written by the MCP server
-- after a successful query_hr_metrics call.
CREATE TABLE audit_log (
    id              SERIAL PRIMARY KEY,
    manager_email   TEXT NOT NULL,
    manager_scope   TEXT NOT NULL,
    cube_query      JSONB NOT NULL,
    row_count       INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);
CREATE INDEX audit_log_manager_idx ON audit_log(manager_email);
