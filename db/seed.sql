-- Sample data: 3 teams, 42 employees, rich metrics, location data.
-- "Today" for this sample is 2026-05-16.

INSERT INTO teams (name, cost_centre) VALUES
    ('Engineering', 'CC-ENG-001'),
    ('Sales',       'CC-SAL-002'),
    ('People',      'CC-PPL-003');

-- salary_band legend: Band A < £55k, Band B £55-75k, Band C £75-95k, Band D > £95k

-- Engineering (18 employees) -------------------------------------------------
INSERT INTO employees
    (full_name, email, team_id, role, start_date, end_date,
     location_city, location_country, latitude, longitude, salary_band,
     salary, date_of_birth)
VALUES
    ('Ava Thompson',   'ava.thompson@example.com',   1, 'Engineering Manager', '2021-03-15', NULL,       'London',     'UK',     51.5074,  -0.1278, 'Band D', 95000,  '1985-07-12'),
    ('Ben Carter',     'ben.carter@example.com',     1, 'Staff Engineer',      '2019-09-01', NULL,       'Manchester', 'UK',     53.4808,  -2.2426, 'Band D', 105000, '1983-04-22'),
    ('Chloe Davies',   'chloe.davies@example.com',   1, 'Senior Engineer',     '2022-01-10', NULL,       'London',     'UK',     51.5074,  -0.1278, 'Band C', 82000,  '1990-11-05'),
    ('Daniel Evans',   'daniel.evans@example.com',   1, 'Senior Engineer',     '2020-06-22', NULL,       'Bristol',    'UK',     51.4545,  -2.5879, 'Band C', 84000,  '1988-02-17'),
    ('Ella Foster',    'ella.foster@example.com',    1, 'Engineer',            '2023-04-03', NULL,       'Leeds',      'UK',     53.8008,  -1.5491, 'Band B', 68000,  '1995-08-30'),
    ('Finn Gallagher', 'finn.gallagher@example.com', 1, 'Engineer',            '2023-08-15', NULL,       'Edinburgh',  'UK',     55.9533,  -3.1883, 'Band B', 67000,  '1994-12-19'),
    ('Grace Hughes',   'grace.hughes@example.com',   1, 'Senior Engineer',     '2021-11-08', NULL,       'London',     'UK',     51.5074,  -0.1278, 'Band C', 81000,  '1989-05-09'),
    ('Hugo Iqbal',     'hugo.iqbal@example.com',     1, 'Junior Engineer',     '2024-09-02', NULL,       'Birmingham', 'UK',     52.4862,  -1.8904, 'Band A', 52000,  '2000-03-25'),
    ('Iris Jones',     'iris.jones@example.com',     1, 'Engineer',            '2022-07-19', NULL,       'Cardiff',    'UK',     51.4816,  -3.1791, 'Band B', 70000,  '1992-10-14'),
    ('Jack Khan',      'jack.khan@example.com',      1, 'Engineer',            '2023-02-06', NULL,       'Manchester', 'UK',     53.4808,  -2.2426, 'Band B', 69000,  '1993-06-21'),
    ('Kara Lloyd',     'kara.lloyd@example.com',     1, 'Senior Engineer',     '2020-10-12', NULL,       'London',     'UK',     51.5074,  -0.1278, 'Band C', 83000,  '1987-09-03'),
    ('Liam Murphy',    'liam.murphy@example.com',    1, 'Staff Engineer',      '2018-05-21', NULL,       'Dublin',     'Ireland',53.3498,  -6.2603, 'Band D', 110000, '1982-01-28'),
    ('Mia Nazari',     'mia.nazari@example.com',     1, 'Engineer',            '2024-01-15', NULL,       'London',     'UK',     51.5074,  -0.1278, 'Band B', 66000,  '1996-11-08'),
    ('Noah Owens',     'noah.owens@example.com',     1, 'Engineer',            '2023-11-27', NULL,       'Leeds',      'UK',     53.8008,  -1.5491, 'Band B', 67500,  '1994-04-16'),
    ('Olivia Patel',   'olivia.patel@example.com',   1, 'Senior Engineer',     '2021-08-09', NULL,       'London',     'UK',     51.5074,  -0.1278, 'Band C', 82500,  '1989-08-23'),
    ('Peter Quinn',    'peter.quinn@example.com',    1, 'Junior Engineer',     '2025-02-03', NULL,       'Glasgow',    'UK',     55.8642,  -4.2518, 'Band A', 51000,  '2001-07-14'),
    ('Rosa Stein',     'rosa.stein@example.com',     1, 'Engineer',            '2022-09-26', '2026-02-28','Berlin',   'Germany',52.5200,  13.4050, 'Band B', 71000,  '1991-12-02'),
    ('Sam Turner',     'sam.turner@example.com',     1, 'Senior Engineer',     '2020-04-14', '2025-11-30','London',   'UK',     51.5074,  -0.1278, 'Band C', 80000,  '1988-06-30');

-- Sales (13 employees, including 2 new 2026 joiners) --------------------------
INSERT INTO employees
    (full_name, email, team_id, role, start_date, end_date,
     location_city, location_country, latitude, longitude, salary_band,
     salary, date_of_birth)
VALUES
    ('Tara Underwood', 'tara.underwood@example.com', 2, 'Sales Director',    '2019-02-11', NULL,        'London',      'UK',         51.5074, -0.1278, 'Band D', 120000, '1981-03-19'),
    ('Umar Vance',     'umar.vance@example.com',     2, 'Account Executive', '2022-04-05', NULL,        'Manchester',  'UK',         53.4808, -2.2426, 'Band B', 72000,  '1990-09-11'),
    ('Vera Walsh',     'vera.walsh@example.com',     2, 'Account Executive', '2021-07-18', NULL,        'London',      'UK',         51.5074, -0.1278, 'Band B', 74000,  '1988-11-26'),
    ('Will Xu',        'will.xu@example.com',        2, 'SDR',               '2024-03-04', NULL,        'Birmingham',  'UK',         52.4862, -1.8904, 'Band A', 48000,  '1999-05-07'),
    ('Xena Young',     'xena.young@example.com',     2, 'Account Executive', '2023-01-30', NULL,        'Edinburgh',   'UK',         55.9533, -3.1883, 'Band B', 71500,  '1991-02-15'),
    ('Yusuf Zaman',    'yusuf.zaman@example.com',    2, 'SDR',               '2024-08-12', NULL,        'London',      'UK',         51.5074, -0.1278, 'Band A', 47500,  '2000-10-04'),
    ('Aisha Black',    'aisha.black@example.com',    2, 'Senior AE',         '2020-09-14', NULL,        'Bristol',     'UK',         51.4545, -2.5879, 'Band C', 89000,  '1986-12-13'),
    ('Bruno Cole',     'bruno.cole@example.com',     2, 'Account Executive', '2023-06-20', NULL,        'Paris',       'France',     48.8566,  2.3522, 'Band B', 70000,  '1993-04-09'),
    ('Cleo Dean',      'cleo.dean@example.com',      2, 'SDR',               '2025-01-13', NULL,        'Leeds',       'UK',         53.8008, -1.5491, 'Band A', 46000,  '2001-08-22'),
    ('Drew Ellis',     'drew.ellis@example.com',     2, 'Account Executive', '2022-10-08', NULL,        'London',      'UK',         51.5074, -0.1278, 'Band B', 72500,  '1992-03-17'),
    ('Eve Fox',        'eve.fox@example.com',        2, 'Senior AE',         '2021-05-25', '2025-12-15','London',      'UK',         51.5074, -0.1278, 'Band C', 87000,  '1987-07-30'),
    ('Felix Grant',    'felix.grant@example.com',    2, 'SDR',               '2024-11-04', NULL,        'Manchester',  'UK',         53.4808, -2.2426, 'Band A', 47000,  '1998-09-26'),
    ('Gia Hall',       'gia.hall@example.com',       2, 'Account Executive', '2026-02-17', NULL,        'Amsterdam',   'Netherlands',52.3676,  4.9041, 'Band B', 73000,  '1993-11-14');

-- People (11 employees, including 1 new 2026 joiner) -------------------------
INSERT INTO employees
    (full_name, email, team_id, role, start_date, end_date,
     location_city, location_country, latitude, longitude, salary_band,
     salary, date_of_birth)
VALUES
    ('Gemma Hale',   'gemma.hale@example.com',   3, 'Head of People',    '2020-01-20', NULL,        'London',    'UK',      51.5074, -0.1278, 'Band D', 110000, '1980-04-08'),
    ('Henry Innis',  'henry.innis@example.com',  3, 'People Partner',    '2022-06-13', NULL,        'Manchester','UK',      53.4808, -2.2426, 'Band B', 72000,  '1989-10-22'),
    ('Ivy James',    'ivy.james@example.com',    3, 'Recruiter',         '2023-03-27', NULL,        'London',    'UK',      51.5074, -0.1278, 'Band B', 58000,  '1993-12-01'),
    ('Jonah Klein',  'jonah.klein@example.com',  3, 'People Partner',    '2021-09-15', NULL,        'Bristol',   'UK',      51.4545, -2.5879, 'Band B', 70000,  '1988-05-19'),
    ('Kira Lowe',    'kira.lowe@example.com',    3, 'L&D Specialist',    '2022-11-09', NULL,        'Edinburgh', 'UK',      55.9533, -3.1883, 'Band B', 64000,  '1991-01-25'),
    ('Leo Mason',    'leo.mason@example.com',    3, 'Recruiter',         '2024-05-06', NULL,        'Leeds',     'UK',      53.8008, -1.5491, 'Band A', 56000,  '1996-08-11'),
    ('Maya North',   'maya.north@example.com',   3, 'People Operations', '2023-08-22', NULL,        'Cardiff',   'UK',      51.4816, -3.1791, 'Band A', 54000,  '1994-06-04'),
    ('Niall Orr',    'niall.orr@example.com',    3, 'People Partner',    '2021-04-19', NULL,        'Dublin',    'Ireland', 53.3498, -6.2603, 'Band B', 71000,  '1987-11-29'),
    ('Orla Price',   'orla.price@example.com',   3, 'Recruiter',         '2025-03-10', NULL,        'Glasgow',   'UK',      55.8642, -4.2518, 'Band A', 55000,  '1997-02-18'),
    ('Pavel Reid',   'pavel.reid@example.com',   3, 'People Operations', '2022-02-28', '2026-01-31','London',    'UK',      51.5074, -0.1278, 'Band A', 53000,  '1990-07-06'),
    ('Quinn Stone',  'quinn.stone@example.com',  3, 'People Partner',    '2026-01-06', NULL,        'London',    'UK',      51.5074, -0.1278, 'Band B', 69000,  '1992-09-03');

-- Employment events from start/end dates --------------------------------------
INSERT INTO employment_events (employee_id, event_type, event_date, detail)
SELECT id, 'joined', start_date, 'Hired' FROM employees;

INSERT INTO employment_events (employee_id, event_type, event_date, detail)
SELECT id, 'left', end_date, 'Resigned' FROM employees WHERE end_date IS NOT NULL;

-- Absences --------------------------------------------------------------------
-- Individual holiday counts per person so every employee has a distinct total.
-- Unnest is done inside a subquery to be compatible with all PostgreSQL versions.

INSERT INTO absences (employee_id, absence_date, absence_type, reason)
SELECT e.id, x.d::date, 'holiday', NULL
FROM employees e
JOIN (
  SELECT email, unnest(dates) AS d FROM (VALUES
    ('ava.thompson@example.com',   ARRAY['2025-01-06','2025-01-07','2025-01-08','2025-04-18','2025-04-22','2025-04-23','2025-07-14','2025-07-15','2025-07-16','2025-07-17','2025-07-18','2025-10-27','2025-10-28','2025-10-29','2025-12-23','2025-12-24','2025-12-29','2025-12-30','2025-12-31','2025-06-02','2025-06-03']),
    ('ben.carter@example.com',     ARRAY['2025-02-17','2025-02-18','2025-02-19','2025-02-20','2025-02-21','2025-05-27','2025-05-28','2025-05-29','2025-08-04','2025-08-05','2025-08-06','2025-08-07','2025-08-08','2025-11-03','2025-11-04','2025-11-05','2025-12-23','2025-12-24']),
    ('chloe.davies@example.com',   ARRAY['2025-03-03','2025-03-04','2025-03-05','2025-06-09','2025-06-10','2025-06-11','2025-06-12','2025-06-13','2025-09-01','2025-09-02','2025-09-03','2025-09-04','2025-09-05','2025-12-22','2025-12-23','2025-12-24']),
    ('daniel.evans@example.com',   ARRAY['2025-01-20','2025-01-21','2025-01-22','2025-04-07','2025-04-08','2025-04-09','2025-04-10','2025-07-28','2025-07-29','2025-07-30','2025-07-31','2025-10-06','2025-10-07','2025-10-08','2025-10-09','2025-10-10','2025-12-29','2025-12-30','2025-12-31']),
    ('ella.foster@example.com',    ARRAY['2025-02-24','2025-02-25','2025-02-26','2025-02-27','2025-05-12','2025-05-13','2025-05-14','2025-08-18','2025-08-19','2025-08-20','2025-11-17','2025-11-18','2025-11-19','2025-11-20','2025-12-22']),
    ('finn.gallagher@example.com', ARRAY['2025-03-17','2025-03-18','2025-03-19','2025-03-20','2025-03-21','2025-06-23','2025-06-24','2025-06-25','2025-09-15','2025-09-16','2025-09-17','2025-12-22','2025-12-23']),
    ('grace.hughes@example.com',   ARRAY['2025-01-13','2025-01-14','2025-01-15','2025-01-16','2025-04-28','2025-04-29','2025-04-30','2025-07-07','2025-07-08','2025-07-09','2025-07-10','2025-07-11','2025-10-13','2025-10-14','2025-10-15','2025-10-16','2025-10-17','2025-12-22','2025-12-23','2025-12-24','2025-12-29','2025-12-30','2025-12-31']),
    ('hugo.iqbal@example.com',     ARRAY['2025-09-08','2025-09-09','2025-09-10','2025-09-11','2025-09-12','2025-12-22','2025-12-23','2025-12-24']),
    ('iris.jones@example.com',     ARRAY['2025-02-10','2025-02-11','2025-02-12','2025-04-14','2025-04-15','2025-04-16','2025-07-21','2025-07-22','2025-07-23','2025-07-24','2025-07-25','2025-10-20','2025-10-21','2025-10-22','2025-12-22','2025-12-23','2025-12-24']),
    ('jack.khan@example.com',      ARRAY['2025-03-24','2025-03-25','2025-03-26','2025-03-27','2025-06-30','2025-07-01','2025-07-02','2025-09-22','2025-09-23','2025-09-24','2025-09-25','2025-09-26','2025-12-22','2025-12-23']),
    ('kara.lloyd@example.com',     ARRAY['2025-01-27','2025-01-28','2025-01-29','2025-01-30','2025-01-31','2025-05-19','2025-05-20','2025-05-21','2025-05-22','2025-05-23','2025-08-11','2025-08-12','2025-08-13','2025-08-14','2025-08-15','2025-11-10','2025-11-11','2025-11-12','2025-12-22','2025-12-23','2025-12-24','2025-12-29','2025-12-30','2025-12-31']),
    ('liam.murphy@example.com',    ARRAY['2025-02-03','2025-02-04','2025-02-05','2025-02-06','2025-02-07','2025-05-05','2025-05-06','2025-05-07','2025-05-08','2025-05-09','2025-08-25','2025-08-26','2025-08-27','2025-08-28','2025-08-29','2025-11-24','2025-11-25','2025-11-26','2025-11-27','2025-11-28','2025-12-22','2025-12-23','2025-12-24','2025-12-29','2025-12-30']),
    ('mia.nazari@example.com',     ARRAY['2025-04-01','2025-04-02','2025-04-03','2025-06-16','2025-06-17','2025-06-18','2025-09-29','2025-09-30','2025-10-01','2025-12-22','2025-12-23']),
    ('noah.owens@example.com',     ARRAY['2025-03-10','2025-03-11','2025-03-12','2025-06-02','2025-06-03','2025-06-04','2025-09-08','2025-09-09','2025-12-22','2025-12-23','2025-12-24']),
    ('olivia.patel@example.com',   ARRAY['2025-01-06','2025-01-07','2025-01-08','2025-01-09','2025-04-22','2025-04-23','2025-04-24','2025-04-25','2025-07-14','2025-07-15','2025-07-16','2025-07-17','2025-10-27','2025-10-28','2025-10-29','2025-10-30','2025-10-31','2025-12-22','2025-12-23','2025-12-24']),
    ('peter.quinn@example.com',    ARRAY['2025-05-26','2025-05-27','2025-05-28','2025-08-04','2025-08-05','2025-08-06','2025-12-22','2025-12-23']),
    ('tara.underwood@example.com', ARRAY['2025-01-06','2025-01-07','2025-01-08','2025-01-09','2025-01-10','2025-04-14','2025-04-15','2025-04-16','2025-04-17','2025-07-07','2025-07-08','2025-07-09','2025-07-10','2025-07-11','2025-08-11','2025-08-12','2025-08-13','2025-08-14','2025-08-15','2025-10-27','2025-10-28','2025-10-29','2025-12-22','2025-12-23','2025-12-24','2025-12-29','2025-12-30']),
    ('umar.vance@example.com',     ARRAY['2025-02-10','2025-02-11','2025-02-12','2025-05-19','2025-05-20','2025-05-21','2025-08-18','2025-08-19','2025-08-20','2025-11-17','2025-11-18','2025-12-22','2025-12-23','2025-12-24']),
    ('vera.walsh@example.com',     ARRAY['2025-03-03','2025-03-04','2025-03-05','2025-03-06','2025-06-09','2025-06-10','2025-06-11','2025-06-12','2025-09-01','2025-09-02','2025-09-03','2025-09-04','2025-09-05','2025-12-22','2025-12-23','2025-12-24','2025-12-29','2025-12-30','2025-12-31']),
    ('will.xu@example.com',        ARRAY['2025-07-21','2025-07-22','2025-07-23','2025-10-06','2025-10-07','2025-10-08','2025-12-22','2025-12-23']),
    ('xena.young@example.com',     ARRAY['2025-02-24','2025-02-25','2025-02-26','2025-05-26','2025-05-27','2025-05-28','2025-08-25','2025-08-26','2025-08-27','2025-11-24','2025-11-25','2025-12-22','2025-12-23','2025-12-24']),
    ('yusuf.zaman@example.com',    ARRAY['2025-08-04','2025-08-05','2025-08-06','2025-11-03','2025-11-04','2025-12-22','2025-12-23']),
    ('aisha.black@example.com',    ARRAY['2025-01-13','2025-01-14','2025-01-15','2025-01-16','2025-04-28','2025-04-29','2025-04-30','2025-07-14','2025-07-15','2025-07-16','2025-07-17','2025-07-18','2025-10-13','2025-10-14','2025-10-15','2025-12-22','2025-12-23','2025-12-24','2025-12-29','2025-12-30','2025-12-31']),
    ('bruno.cole@example.com',     ARRAY['2025-03-17','2025-03-18','2025-03-19','2025-06-23','2025-06-24','2025-06-25','2025-09-15','2025-09-16','2025-09-17','2025-12-22','2025-12-23']),
    ('cleo.dean@example.com',      ARRAY['2025-04-14','2025-04-15','2025-07-07','2025-07-08','2025-12-22','2025-12-23']),
    ('drew.ellis@example.com',     ARRAY['2025-01-27','2025-01-28','2025-01-29','2025-05-05','2025-05-06','2025-05-07','2025-08-11','2025-08-12','2025-08-13','2025-11-10','2025-11-11','2025-11-12','2025-12-22','2025-12-23','2025-12-24']),
    ('felix.grant@example.com',    ARRAY['2025-12-22','2025-12-23','2025-12-24']),
    ('gemma.hale@example.com',     ARRAY['2025-01-06','2025-01-07','2025-01-08','2025-04-14','2025-04-15','2025-04-16','2025-04-17','2025-07-07','2025-07-08','2025-07-09','2025-07-10','2025-07-11','2025-10-06','2025-10-07','2025-10-08','2025-10-09','2025-10-10','2025-12-22','2025-12-23','2025-12-24','2025-12-29','2025-12-30','2025-12-31','2025-06-02','2025-06-03','2025-06-04']),
    ('henry.innis@example.com',    ARRAY['2025-02-17','2025-02-18','2025-02-19','2025-05-19','2025-05-20','2025-05-21','2025-08-04','2025-08-05','2025-08-06','2025-08-07','2025-11-03','2025-11-04','2025-11-05','2025-12-22','2025-12-23','2025-12-24','2025-12-29','2025-12-30']),
    ('ivy.james@example.com',      ARRAY['2025-03-03','2025-03-04','2025-03-05','2025-06-09','2025-06-10','2025-06-11','2025-09-01','2025-09-02','2025-09-03','2025-12-22','2025-12-23']),
    ('jonah.klein@example.com',    ARRAY['2025-01-20','2025-01-21','2025-01-22','2025-01-23','2025-04-22','2025-04-23','2025-04-24','2025-07-21','2025-07-22','2025-07-23','2025-07-24','2025-10-20','2025-10-21','2025-10-22','2025-12-22','2025-12-23','2025-12-24','2025-12-29']),
    ('kira.lowe@example.com',      ARRAY['2025-02-10','2025-02-11','2025-02-12','2025-05-12','2025-05-13','2025-05-14','2025-08-18','2025-08-19','2025-08-20','2025-11-17','2025-11-18','2025-12-22','2025-12-23','2025-12-24']),
    ('leo.mason@example.com',      ARRAY['2025-07-28','2025-07-29','2025-07-30','2025-10-13','2025-10-14','2025-12-22','2025-12-23']),
    ('maya.north@example.com',     ARRAY['2025-04-07','2025-04-08','2025-04-09','2025-07-14','2025-07-15','2025-07-16','2025-10-27','2025-10-28','2025-12-22','2025-12-23','2025-12-24']),
    ('niall.orr@example.com',      ARRAY['2025-01-06','2025-01-07','2025-01-08','2025-04-28','2025-04-29','2025-04-30','2025-08-11','2025-08-12','2025-08-13','2025-08-14','2025-11-10','2025-11-11','2025-11-12','2025-11-13','2025-11-14','2025-12-22','2025-12-23','2025-12-24','2025-12-29','2025-12-30','2025-12-31']),
    ('orla.price@example.com',     ARRAY['2025-05-26','2025-05-27','2025-06-09','2025-06-10','2025-12-22','2025-12-23'])
  ) AS raw(email, dates)
) AS x ON e.email = x.email
ON CONFLICT (employee_id, absence_date) DO NOTHING;

-- 2026 holidays (Jan–May for current active employees) ----------------------
INSERT INTO absences (employee_id, absence_date, absence_type, reason)
SELECT e.id, x.d::date, 'holiday', NULL
FROM employees e
JOIN (
  SELECT email, unnest(dates) AS d FROM (VALUES
    ('ava.thompson@example.com',   ARRAY['2026-01-02','2026-01-05','2026-04-01','2026-04-02','2026-04-03']),
    ('ben.carter@example.com',     ARRAY['2026-01-02','2026-02-16','2026-02-17','2026-02-18','2026-04-06','2026-04-07']),
    ('chloe.davies@example.com',   ARRAY['2026-01-02','2026-01-05','2026-03-02','2026-03-03','2026-04-20']),
    ('daniel.evans@example.com',   ARRAY['2026-01-02','2026-04-14','2026-04-15','2026-04-16']),
    ('ella.foster@example.com',    ARRAY['2026-01-02','2026-03-16','2026-03-17','2026-03-18','2026-05-04','2026-05-05']),
    ('finn.gallagher@example.com', ARRAY['2026-01-02','2026-04-27','2026-04-28']),
    ('grace.hughes@example.com',   ARRAY['2026-01-02','2026-01-05','2026-02-23','2026-02-24','2026-02-25','2026-04-01','2026-04-02','2026-04-03']),
    ('hugo.iqbal@example.com',     ARRAY['2026-01-02','2026-04-06','2026-04-07']),
    ('iris.jones@example.com',     ARRAY['2026-01-02','2026-03-09','2026-03-10','2026-04-20','2026-04-21']),
    ('jack.khan@example.com',      ARRAY['2026-01-02','2026-03-23','2026-03-24','2026-04-14','2026-04-15']),
    ('kara.lloyd@example.com',     ARRAY['2026-01-02','2026-01-05','2026-01-06','2026-04-01','2026-04-02','2026-04-03','2026-05-11','2026-05-12']),
    ('liam.murphy@example.com',    ARRAY['2026-01-02','2026-02-02','2026-02-03','2026-02-04','2026-02-05','2026-04-06','2026-04-07','2026-04-08','2026-04-09']),
    ('mia.nazari@example.com',     ARRAY['2026-01-02','2026-04-01','2026-04-02']),
    ('noah.owens@example.com',     ARRAY['2026-01-02','2026-03-30','2026-03-31','2026-04-01']),
    ('olivia.patel@example.com',   ARRAY['2026-01-02','2026-01-05','2026-04-14','2026-04-15','2026-04-16','2026-04-17','2026-05-04']),
    ('peter.quinn@example.com',    ARRAY['2026-01-02','2026-04-06']),
    ('tara.underwood@example.com', ARRAY['2026-01-02','2026-01-05','2026-01-06','2026-04-01','2026-04-02','2026-04-03','2026-04-06','2026-05-04','2026-05-05']),
    ('umar.vance@example.com',     ARRAY['2026-01-02','2026-03-02','2026-03-03','2026-03-04','2026-04-20','2026-04-21']),
    ('vera.walsh@example.com',     ARRAY['2026-01-02','2026-01-05','2026-04-14','2026-04-15','2026-04-16','2026-04-17','2026-04-20']),
    ('will.xu@example.com',        ARRAY['2026-01-02','2026-04-06','2026-04-07']),
    ('xena.young@example.com',     ARRAY['2026-01-02','2026-03-16','2026-03-17','2026-04-27','2026-04-28','2026-04-29']),
    ('yusuf.zaman@example.com',    ARRAY['2026-01-02','2026-04-06']),
    ('aisha.black@example.com',    ARRAY['2026-01-02','2026-01-05','2026-04-01','2026-04-02','2026-04-03','2026-05-04','2026-05-05']),
    ('bruno.cole@example.com',     ARRAY['2026-01-02','2026-03-30','2026-03-31','2026-04-01','2026-04-02']),
    ('cleo.dean@example.com',      ARRAY['2026-01-02','2026-04-14','2026-04-15']),
    ('drew.ellis@example.com',     ARRAY['2026-01-02','2026-02-23','2026-02-24','2026-04-06','2026-04-07','2026-04-08']),
    ('felix.grant@example.com',    ARRAY['2026-01-02','2026-04-06','2026-04-07','2026-04-08']),
    ('gia.hall@example.com',       ARRAY['2026-04-01','2026-04-02','2026-04-03']),
    ('gemma.hale@example.com',     ARRAY['2026-01-02','2026-01-05','2026-01-06','2026-04-01','2026-04-02','2026-04-03','2026-04-06','2026-05-04','2026-05-05','2026-05-06']),
    ('henry.innis@example.com',    ARRAY['2026-01-02','2026-02-16','2026-02-17','2026-04-14','2026-04-15','2026-04-16','2026-04-17']),
    ('ivy.james@example.com',      ARRAY['2026-01-02','2026-03-09','2026-03-10','2026-04-20']),
    ('jonah.klein@example.com',    ARRAY['2026-01-02','2026-01-05','2026-04-01','2026-04-02','2026-04-03','2026-04-06']),
    ('kira.lowe@example.com',      ARRAY['2026-01-02','2026-03-23','2026-03-24','2026-04-14','2026-04-15']),
    ('leo.mason@example.com',      ARRAY['2026-01-02','2026-04-27','2026-04-28']),
    ('maya.north@example.com',     ARRAY['2026-01-02','2026-03-02','2026-03-03','2026-04-20','2026-04-21','2026-04-22']),
    ('niall.orr@example.com',      ARRAY['2026-01-02','2026-01-05','2026-01-06','2026-04-01','2026-04-02','2026-04-03','2026-04-06','2026-04-07','2026-05-04']),
    ('orla.price@example.com',     ARRAY['2026-01-02','2026-04-14','2026-04-15']),
    ('quinn.stone@example.com',    ARRAY['2026-04-01','2026-04-02','2026-04-03','2026-05-04'])
  ) AS raw(email, dates)
) AS x ON e.email = x.email
WHERE (e.end_date IS NULL OR e.end_date >= x.d::date)
ON CONFLICT (employee_id, absence_date) DO NOTHING;

-- Sick days — fewer, with a reason we deliberately exclude from the manager view.
INSERT INTO absences (employee_id, absence_date, absence_type, reason)
SELECT
    e.id,
    (DATE '2025-02-01' + ((e.id * 17 + n * 23) % 365))::date,
    'sick',
    CASE (e.id + n) % 3 WHEN 0 THEN 'flu' WHEN 1 THEN 'migraine' ELSE 'stomach bug' END
FROM employees e
CROSS JOIN generate_series(1, 3) AS n
WHERE e.end_date IS NULL OR e.end_date > DATE '2025-12-31'
ON CONFLICT (employee_id, absence_date) DO NOTHING;
