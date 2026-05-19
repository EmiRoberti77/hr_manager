-- Training module: courses, YouTube videos, enrollments.
-- Run on existing DBs: psql postgresql://hr:hr@localhost:5432/hr -f db/migrations/001_training.sql
-- Fresh Docker installs also mount this via docker-compose init.

CREATE TABLE training_courses (
    id                SERIAL PRIMARY KEY,
    title             TEXT NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    category          TEXT NOT NULL DEFAULT 'general',
    created_by_email  TEXT NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE training_videos (
    id                SERIAL PRIMARY KEY,
    course_id         INTEGER NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    youtube_url       TEXT NOT NULL,
    youtube_video_id  TEXT NOT NULL,
    position          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX training_videos_course_idx ON training_videos(course_id);

CREATE TABLE training_enrollments (
    id                SERIAL PRIMARY KEY,
    course_id         INTEGER NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
    employee_id       INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    status            TEXT NOT NULL DEFAULT 'not_started'
                      CHECK (status IN ('not_started', 'in_progress', 'completed')),
    assigned_by_email TEXT NOT NULL,
    assigned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    UNIQUE (course_id, employee_id)
);

CREATE INDEX training_enrollments_course_idx ON training_enrollments(course_id);
CREATE INDEX training_enrollments_employee_idx ON training_enrollments(employee_id);

-- RLS: managers see/update enrollments for employees on their team only.
ALTER TABLE training_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_enrollments_team_select ON training_enrollments
    FOR SELECT
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN teams t ON t.id = e.team_id
            WHERE t.name = current_setting('app.manager_team', true)
        )
    );

CREATE POLICY training_enrollments_team_update ON training_enrollments
    FOR UPDATE
    USING (
        employee_id IN (
            SELECT e.id FROM employees e
            JOIN teams t ON t.id = e.team_id
            WHERE t.name = current_setting('app.manager_team', true)
        )
    );

CREATE POLICY training_enrollments_hr_select ON training_enrollments
    FOR SELECT
    USING (current_setting('app.is_hr_admin', true) = 'true');

CREATE POLICY training_enrollments_hr_update ON training_enrollments
    FOR UPDATE
    USING (current_setting('app.is_hr_admin', true) = 'true');

CREATE POLICY training_enrollments_hr_insert ON training_enrollments
    FOR INSERT
    WITH CHECK (current_setting('app.is_hr_admin', true) = 'true');

-- api_writer: full CRUD on training tables (scope enforced in application SQL for HR admin).
GRANT SELECT, INSERT, UPDATE, DELETE ON training_courses TO api_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON training_videos TO api_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON training_enrollments TO api_writer;
GRANT USAGE, SELECT ON SEQUENCE training_courses_id_seq TO api_writer;
GRANT USAGE, SELECT ON SEQUENCE training_videos_id_seq TO api_writer;
GRANT USAGE, SELECT ON SEQUENCE training_enrollments_id_seq TO api_writer;

-- Read employees/teams for assignment fan-out and enrollment joins.
GRANT SELECT ON employees TO api_writer;
GRANT SELECT ON teams TO api_writer;

-- HR admin must read all employees for team assignment fan-out (api_writer role).
CREATE POLICY employees_hr_admin_select ON employees
    FOR SELECT
    USING (current_setting('app.is_hr_admin', true) = 'true');

-- Sample courses and one Engineering assignment.
INSERT INTO training_courses (title, description, category, created_by_email)
VALUES
    (
        'New hire enrollment',
        'Essential steps for enrolling new employees: paperwork, systems access, and first-week checklist.',
        'enrollment',
        'hr.admin@example.com'
    ),
    (
        'Manager essentials',
        'Core skills for people managers: feedback, 1:1s, and performance conversations.',
        'management',
        'hr.admin@example.com'
    ),
    (
        'Workplace safety basics',
        'Health and safety fundamentals every employee should know.',
        'compliance',
        'hr.admin@example.com'
    );

INSERT INTO training_videos (course_id, title, youtube_url, youtube_video_id, position)
VALUES
    (
        1,
        'Welcome and onboarding overview',
        'https://www.youtube.com/watch?v=ZXsQAXx_ao0',
        'ZXsQAXx_ao0',
        0
    ),
    (
        2,
        'How to give effective feedback',
        'https://www.youtube.com/watch?v=wtl5UrrgX8Y',
        'wtl5UrrgX8Y',
        0
    ),
    (
        3,
        'Office safety introduction',
        'https://www.youtube.com/watch?v=2Q_Vz7lLgGQ',
        '2Q_Vz7lLgGQ',
        0
    );

-- Assign "New hire enrollment" to all active Engineering employees.
INSERT INTO training_enrollments (course_id, employee_id, status, assigned_by_email)
SELECT 1, e.id, 'not_started', 'hr.admin@example.com'
FROM employees e
JOIN teams t ON t.id = e.team_id
WHERE t.name = 'Engineering' AND e.end_date IS NULL
ON CONFLICT (course_id, employee_id) DO NOTHING;
