-- Employee expense receipts: OCR extraction, line items, team-scoped visibility.
-- Run on existing DBs: psql postgresql://hr:hr@localhost:5432/hr -f db/migrations/003_expenses.sql

CREATE TABLE expenses (
    id               SERIAL PRIMARY KEY,
    employee_id      INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'processing'
                     CHECK (status IN ('processing', 'draft', 'submitted', 'failed')),
    merchant         TEXT,
    expense_date     DATE,
    currency         TEXT NOT NULL DEFAULT 'GBP',
    total_amount     NUMERIC(12, 2),
    category         TEXT NOT NULL DEFAULT 'other'
                     CHECK (category IN ('travel', 'meals', 'office', 'other')),
    receipt_filename TEXT NOT NULL,
    storage_path     TEXT NOT NULL,
    extraction_raw   JSONB,
    error_message    TEXT,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at     TIMESTAMPTZ
);

CREATE INDEX expenses_employee_idx ON expenses(employee_id);
CREATE INDEX expenses_status_idx ON expenses(status);
CREATE INDEX expenses_created_idx ON expenses(created_at DESC);

CREATE TABLE expense_line_items (
    id          SERIAL PRIMARY KEY,
    expense_id  INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity    NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price  NUMERIC(12, 2),
    amount      NUMERIC(12, 2) NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX expense_line_items_expense_idx ON expense_line_items(expense_id);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_line_items ENABLE ROW LEVEL SECURITY;

-- Employee: own expenses only.
CREATE POLICY expenses_employee_select ON expenses
    FOR SELECT
    USING (employee_id = NULLIF(current_setting('app.employee_id', true), '')::integer);

CREATE POLICY expenses_employee_insert ON expenses
    FOR INSERT
    WITH CHECK (employee_id = NULLIF(current_setting('app.employee_id', true), '')::integer);

CREATE POLICY expenses_employee_update ON expenses
    FOR UPDATE
    USING (employee_id = NULLIF(current_setting('app.employee_id', true), '')::integer);

CREATE POLICY expenses_employee_delete ON expenses
    FOR DELETE
    USING (
        employee_id = NULLIF(current_setting('app.employee_id', true), '')::integer
        AND status IN ('processing', 'draft', 'failed')
    );

-- Manager: read team expenses.
CREATE POLICY expenses_manager_select ON expenses
    FOR SELECT
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN teams t ON t.id = e.team_id
            WHERE t.name = current_setting('app.manager_team', true)
        )
    );

-- HR admin: full access.
CREATE POLICY expenses_hr_all ON expenses
    FOR ALL
    USING (current_setting('app.is_hr_admin', true) = 'true')
    WITH CHECK (current_setting('app.is_hr_admin', true) = 'true');

-- Line items: visible when parent expense is visible.
CREATE POLICY expense_line_items_employee ON expense_line_items
    FOR ALL
    USING (
        expense_id IN (
            SELECT id FROM expenses
            WHERE employee_id = NULLIF(current_setting('app.employee_id', true), '')::integer
        )
    )
    WITH CHECK (
        expense_id IN (
            SELECT id FROM expenses
            WHERE employee_id = NULLIF(current_setting('app.employee_id', true), '')::integer
        )
    );

CREATE POLICY expense_line_items_manager_select ON expense_line_items
    FOR SELECT
    USING (
        expense_id IN (
            SELECT ex.id FROM expenses ex
            JOIN employees e ON e.id = ex.employee_id
            JOIN teams t ON t.id = e.team_id
            WHERE t.name = current_setting('app.manager_team', true)
        )
    );

CREATE POLICY expense_line_items_hr ON expense_line_items
    FOR ALL
    USING (current_setting('app.is_hr_admin', true) = 'true')
    WITH CHECK (current_setting('app.is_hr_admin', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON expenses TO api_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_line_items TO api_writer;
GRANT USAGE, SELECT ON SEQUENCE expenses_id_seq TO api_writer;
GRANT USAGE, SELECT ON SEQUENCE expense_line_items_id_seq TO api_writer;

GRANT SELECT ON employees TO api_writer;
GRANT SELECT ON teams TO api_writer;
