-- Row-level security: defence in depth.
--
-- Permissions are *primarily* enforced in the semantic layer (Cube's
-- queryRewrite injects a team filter from the signed token). RLS here is a
-- belt-and-braces second line so that even direct SQL from a misconfigured
-- service stays within scope.
--
-- The session variable `app.manager_team` is set per connection by callers
-- that hit Postgres directly (e.g. the API's audit-log writer). Cube itself
-- uses its own connection and is constrained by queryRewrite, not by this.

ALTER TABLE employees           ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_events   ENABLE ROW LEVEL SECURITY;

-- A NULL/empty manager_team means "no scope set" → no rows. Fail closed.
CREATE POLICY employees_team_scope ON employees
    FOR SELECT
    USING (
        team_id = (
            SELECT id FROM teams
            WHERE name = current_setting('app.manager_team', true)
        )
    );

CREATE POLICY absences_team_scope ON absences
    FOR SELECT
    USING (
        employee_id IN (
            SELECT id FROM employees
            WHERE team_id = (
                SELECT id FROM teams
                WHERE name = current_setting('app.manager_team', true)
            )
        )
    );

CREATE POLICY employment_events_team_scope ON employment_events
    FOR SELECT
    USING (
        employee_id IN (
            SELECT id FROM employees
            WHERE team_id = (
                SELECT id FROM teams
                WHERE name = current_setting('app.manager_team', true)
            )
        )
    );

-- A `cube_reader` role used by Cube. Cube's scope is enforced by queryRewrite
-- in the semantic layer, not by RLS — the policies above key on a session
-- variable Cube doesn't set, so leaving Cube under RLS would filter out every
-- row. BYPASSRLS matches the documented design ("Cube itself uses its own
-- connection and is constrained by queryRewrite, not by this") and keeps RLS
-- as the backstop for any other non-owner role that hits Postgres directly.
CREATE ROLE cube_reader LOGIN PASSWORD 'cube' BYPASSRLS;
GRANT CONNECT ON DATABASE hr TO cube_reader;
GRANT USAGE ON SCHEMA public TO cube_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cube_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO cube_reader;

-- The audit_log is written by the API, not by Cube. Grant INSERT only to a
-- dedicated role used by api/.
CREATE ROLE api_writer LOGIN PASSWORD 'api';
GRANT CONNECT ON DATABASE hr TO api_writer;
GRANT USAGE ON SCHEMA public TO api_writer;
GRANT INSERT, SELECT ON audit_log TO api_writer;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO api_writer;
