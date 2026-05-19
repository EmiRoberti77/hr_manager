-- Allow HR admin (training module) to read all employees for assignment fan-out.
-- api_writer sets SET LOCAL app.is_hr_admin = 'true' on HR admin requests.

CREATE POLICY employees_hr_admin_select ON employees
    FOR SELECT
    USING (current_setting('app.is_hr_admin', true) = 'true');
