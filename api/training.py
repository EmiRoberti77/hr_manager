"""Training module REST API — courses, videos, assignments, enrollments."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import ManagerIdentity, get_manager, require_hr_admin
from training_db import training_conn
from youtube import parse_youtube_video_id

router = APIRouter(prefix="/training", tags=["training"])

EnrollmentStatus = Literal["not_started", "in_progress", "completed"]


class CourseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    category: str = "general"


class CourseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = None


class VideoCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    youtube_url: str = Field(min_length=1)


class AssignmentCreate(BaseModel):
    course_id: int
    team: str | None = None
    employee_ids: list[int] | None = None


class EnrollmentUpdate(BaseModel):
    status: EnrollmentStatus


class VideoOut(BaseModel):
    id: int
    course_id: int
    title: str
    youtube_url: str
    youtube_video_id: str
    position: int


class CourseOut(BaseModel):
    id: int
    title: str
    description: str
    category: str
    created_by_email: str
    created_at: datetime
    video_count: int = 0
    enrollment_count: int = 0


class CourseDetailOut(CourseOut):
    videos: list[VideoOut]


class EnrollmentOut(BaseModel):
    id: int
    course_id: int
    course_title: str
    employee_id: int
    employee_name: str
    employee_team: str
    status: EnrollmentStatus
    assigned_by_email: str
    assigned_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class EmployeeOut(BaseModel):
    id: int
    full_name: str
    email: str
    team: str


def _course_from_row(row: dict, video_count: int = 0, enrollment_count: int = 0) -> CourseOut:
    return CourseOut(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        category=row["category"],
        created_by_email=row["created_by_email"],
        created_at=row["created_at"],
        video_count=video_count,
        enrollment_count=enrollment_count,
    )


@router.get("/courses", response_model=list[CourseOut])
def list_courses(manager: ManagerIdentity = Depends(get_manager)) -> list[CourseOut]:
    with training_conn(manager) as conn:
        if manager.is_hr_admin:
            cur = conn.execute(
                """
                SELECT c.*,
                       (SELECT COUNT(*) FROM training_videos v WHERE v.course_id = c.id) AS video_count,
                       (SELECT COUNT(*) FROM training_enrollments e WHERE e.course_id = c.id) AS enrollment_count
                FROM training_courses c
                ORDER BY c.created_at DESC
                """
            )
        else:
            cur = conn.execute(
                """
                SELECT DISTINCT c.*,
                       (SELECT COUNT(*) FROM training_videos v WHERE v.course_id = c.id) AS video_count,
                       (SELECT COUNT(*) FROM training_enrollments e WHERE e.course_id = c.id) AS enrollment_count
                FROM training_courses c
                JOIN training_enrollments e ON e.course_id = c.id
                JOIN employees emp ON emp.id = e.employee_id
                JOIN teams t ON t.id = emp.team_id
                WHERE t.name = %s
                ORDER BY c.created_at DESC
                """,
                (manager.team,),
            )
        rows = cur.fetchall()
        cols = [d.name for d in cur.description]
        return [
            _course_from_row(
                dict(zip(cols, r, strict=True)),
                video_count=r[cols.index("video_count")],
                enrollment_count=r[cols.index("enrollment_count")],
            )
            for r in rows
        ]


@router.get("/courses/{course_id}", response_model=CourseDetailOut)
def get_course(
    course_id: int, manager: ManagerIdentity = Depends(get_manager)
) -> CourseDetailOut:
    with training_conn(manager) as conn:
        if not manager.is_hr_admin:
            allowed = conn.execute(
                """
                SELECT 1 FROM training_enrollments e
                JOIN employees emp ON emp.id = e.employee_id
                JOIN teams t ON t.id = emp.team_id
                WHERE e.course_id = %s AND t.name = %s
                LIMIT 1
                """,
                (course_id, manager.team),
            ).fetchone()
            if not allowed:
                raise HTTPException(status_code=404, detail="Course not found")

        cur = conn.execute(
            """
            SELECT c.*,
                   (SELECT COUNT(*) FROM training_videos v WHERE v.course_id = c.id) AS video_count,
                   (SELECT COUNT(*) FROM training_enrollments e WHERE e.course_id = c.id) AS enrollment_count
            FROM training_courses c
            WHERE c.id = %s
            """,
            (course_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Course not found")
        cols = [d.name for d in cur.description]
        course_dict = dict(zip(cols, row, strict=True))
        video_count = course_dict.pop("video_count")
        enrollment_count = course_dict.pop("enrollment_count")

        vcur = conn.execute(
            """
            SELECT id, course_id, title, youtube_url, youtube_video_id, position
            FROM training_videos
            WHERE course_id = %s
            ORDER BY position, id
            """,
            (course_id,),
        )
        videos = [
            VideoOut(
                id=v[0],
                course_id=v[1],
                title=v[2],
                youtube_url=v[3],
                youtube_video_id=v[4],
                position=v[5],
            )
            for v in vcur.fetchall()
        ]

        base = _course_from_row(course_dict, video_count, enrollment_count)
        return CourseDetailOut(**base.model_dump(), videos=videos)


@router.post("/courses", response_model=CourseOut, status_code=201)
def create_course(
    body: CourseCreate, manager: ManagerIdentity = Depends(get_manager)
) -> CourseOut:
    require_hr_admin(manager)
    with training_conn(manager) as conn:
        cur = conn.execute(
            """
            INSERT INTO training_courses (title, description, category, created_by_email)
            VALUES (%s, %s, %s, %s)
            RETURNING id, title, description, category, created_by_email, created_at
            """,
            (body.title, body.description, body.category, manager.email),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create course")
        return _course_from_row(
            {
                "id": row[0],
                "title": row[1],
                "description": row[2],
                "category": row[3],
                "created_by_email": row[4],
                "created_at": row[5],
            }
        )


@router.patch("/courses/{course_id}", response_model=CourseOut)
def update_course(
    course_id: int,
    body: CourseUpdate,
    manager: ManagerIdentity = Depends(get_manager),
) -> CourseOut:
    require_hr_admin(manager)
    updates: list[str] = []
    params: list[object] = []
    if body.title is not None:
        updates.append("title = %s")
        params.append(body.title)
    if body.description is not None:
        updates.append("description = %s")
        params.append(body.description)
    if body.category is not None:
        updates.append("category = %s")
        params.append(body.category)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(course_id)
    with training_conn(manager) as conn:
        cur = conn.execute(
            f"""
            UPDATE training_courses SET {", ".join(updates)}
            WHERE id = %s
            RETURNING id, title, description, category, created_by_email, created_at
            """,
            params,
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Course not found")
        vcount = conn.execute(
            "SELECT COUNT(*) FROM training_videos WHERE course_id = %s", (course_id,)
        ).fetchone()[0]
        ecount = conn.execute(
            "SELECT COUNT(*) FROM training_enrollments WHERE course_id = %s", (course_id,)
        ).fetchone()[0]
        return _course_from_row(
            {
                "id": row[0],
                "title": row[1],
                "description": row[2],
                "category": row[3],
                "created_by_email": row[4],
                "created_at": row[5],
            },
            video_count=vcount,
            enrollment_count=ecount,
        )


@router.delete("/courses/{course_id}", status_code=204)
def delete_course(
    course_id: int, manager: ManagerIdentity = Depends(get_manager)
) -> None:
    require_hr_admin(manager)
    with training_conn(manager) as conn:
        cur = conn.execute("DELETE FROM training_courses WHERE id = %s", (course_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Course not found")


@router.post("/courses/{course_id}/videos", response_model=VideoOut, status_code=201)
def add_video(
    course_id: int,
    body: VideoCreate,
    manager: ManagerIdentity = Depends(get_manager),
) -> VideoOut:
    require_hr_admin(manager)
    try:
        video_id = parse_youtube_video_id(body.youtube_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    with training_conn(manager) as conn:
        exists = conn.execute(
            "SELECT 1 FROM training_courses WHERE id = %s", (course_id,)
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Course not found")

        pos_row = conn.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM training_videos WHERE course_id = %s",
            (course_id,),
        ).fetchone()
        position = pos_row[0] if pos_row else 0

        cur = conn.execute(
            """
            INSERT INTO training_videos
                (course_id, title, youtube_url, youtube_video_id, position)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, course_id, title, youtube_url, youtube_video_id, position
            """,
            (course_id, body.title, body.youtube_url.strip(), video_id, position),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=500, detail="Failed to add video")
        return VideoOut(
            id=row[0],
            course_id=row[1],
            title=row[2],
            youtube_url=row[3],
            youtube_video_id=row[4],
            position=row[5],
        )


@router.delete("/videos/{video_id}", status_code=204)
def delete_video(video_id: int, manager: ManagerIdentity = Depends(get_manager)) -> None:
    require_hr_admin(manager)
    with training_conn(manager) as conn:
        cur = conn.execute("DELETE FROM training_videos WHERE id = %s", (video_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Video not found")


@router.get("/employees", response_model=list[EmployeeOut])
def list_employees_for_assignment(
    manager: ManagerIdentity = Depends(get_manager),
    team: str | None = None,
) -> list[EmployeeOut]:
    require_hr_admin(manager)
    with training_conn(manager) as conn:
        if team:
            cur = conn.execute(
                """
                SELECT e.id, e.full_name, e.email, t.name AS team
                FROM employees e
                JOIN teams t ON t.id = e.team_id
                WHERE t.name = %s AND e.end_date IS NULL
                ORDER BY e.full_name
                """,
                (team,),
            )
        else:
            cur = conn.execute(
                """
                SELECT e.id, e.full_name, e.email, t.name AS team
                FROM employees e
                JOIN teams t ON t.id = e.team_id
                WHERE e.end_date IS NULL
                ORDER BY t.name, e.full_name
                """
            )
        return [
            EmployeeOut(id=r[0], full_name=r[1], email=r[2], team=r[3])
            for r in cur.fetchall()
        ]


@router.post("/assignments", status_code=201)
def create_assignment(
    body: AssignmentCreate, manager: ManagerIdentity = Depends(get_manager)
) -> dict:
    require_hr_admin(manager)
    if not body.team and not body.employee_ids:
        raise HTTPException(
            status_code=400, detail="Provide team and/or employee_ids"
        )

    with training_conn(manager) as conn:
        exists = conn.execute(
            "SELECT 1 FROM training_courses WHERE id = %s", (body.course_id,)
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Course not found")

        employee_ids: set[int] = set(body.employee_ids or [])

        if body.team:
            rows = conn.execute(
                """
                SELECT e.id FROM employees e
                JOIN teams t ON t.id = e.team_id
                WHERE t.name = %s AND e.end_date IS NULL
                """,
                (body.team,),
            ).fetchall()
            if not rows:
                raise HTTPException(status_code=400, detail=f"No active employees on team {body.team}")
            employee_ids.update(r[0] for r in rows)

        if not employee_ids:
            raise HTTPException(status_code=400, detail="No employees to assign")

        inserted = 0
        for eid in employee_ids:
            cur = conn.execute(
                """
                INSERT INTO training_enrollments
                    (course_id, employee_id, status, assigned_by_email)
                VALUES (%s, %s, 'not_started', %s)
                ON CONFLICT (course_id, employee_id) DO NOTHING
                """,
                (body.course_id, eid, manager.email),
            )
            inserted += cur.rowcount

        return {"assigned": inserted, "employee_count": len(employee_ids)}


@router.get("/enrollments", response_model=list[EnrollmentOut])
def list_enrollments(
    course_id: int | None = None,
    manager: ManagerIdentity = Depends(get_manager),
) -> list[EnrollmentOut]:
    with training_conn(manager) as conn:
        sql = """
            SELECT e.id, e.course_id, c.title AS course_title,
                   e.employee_id, emp.full_name AS employee_name,
                   t.name AS employee_team, e.status, e.assigned_by_email,
                   e.assigned_at, e.started_at, e.completed_at
            FROM training_enrollments e
            JOIN training_courses c ON c.id = e.course_id
            JOIN employees emp ON emp.id = e.employee_id
            JOIN teams t ON t.id = emp.team_id
        """
        params: list[object] = []
        clauses: list[str] = []

        if course_id is not None:
            clauses.append("e.course_id = %s")
            params.append(course_id)

        if not manager.is_hr_admin:
            clauses.append("t.name = %s")
            params.append(manager.team)

        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY c.title, emp.full_name"

        cur = conn.execute(sql, params)
        return [
            EnrollmentOut(
                id=r[0],
                course_id=r[1],
                course_title=r[2],
                employee_id=r[3],
                employee_name=r[4],
                employee_team=r[5],
                status=r[6],
                assigned_by_email=r[7],
                assigned_at=r[8],
                started_at=r[9],
                completed_at=r[10],
            )
            for r in cur.fetchall()
        ]


@router.patch("/enrollments/{enrollment_id}", response_model=EnrollmentOut)
def update_enrollment(
    enrollment_id: int,
    body: EnrollmentUpdate,
    manager: ManagerIdentity = Depends(get_manager),
) -> EnrollmentOut:
    now = datetime.now(UTC)
    started_at: datetime | None = None
    completed_at: datetime | None = None

    if body.status == "in_progress":
        started_at = now
    elif body.status == "completed":
        started_at = now
        completed_at = now

    with training_conn(manager) as conn:
        if manager.is_hr_admin:
            cur = conn.execute(
                """
                UPDATE training_enrollments
                SET status = %s,
                    started_at = COALESCE(started_at, %s),
                    completed_at = %s
                WHERE id = %s
                RETURNING id, course_id, employee_id, status, assigned_by_email,
                          assigned_at, started_at, completed_at
                """,
                (body.status, started_at, completed_at, enrollment_id),
            )
        else:
            cur = conn.execute(
                """
                UPDATE training_enrollments e
                SET status = %s,
                    started_at = COALESCE(e.started_at, %s),
                    completed_at = %s
                FROM employees emp
                JOIN teams t ON t.id = emp.team_id
                WHERE e.id = %s AND e.employee_id = emp.id AND t.name = %s
                RETURNING e.id, e.course_id, e.employee_id, e.status, e.assigned_by_email,
                          e.assigned_at, e.started_at, e.completed_at
                """,
                (body.status, started_at, completed_at, enrollment_id, manager.team),
            )

        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Enrollment not found")

        meta = conn.execute(
            """
            SELECT c.title, emp.full_name, t.name
            FROM training_courses c, employees emp
            JOIN teams t ON t.id = emp.team_id
            WHERE c.id = %s AND emp.id = %s
            """,
            (row[1], row[2]),
        ).fetchone()
        if not meta:
            raise HTTPException(status_code=500, detail="Enrollment metadata missing")

        return EnrollmentOut(
            id=row[0],
            course_id=row[1],
            course_title=meta[0],
            employee_id=row[2],
            employee_name=meta[1],
            employee_team=meta[2],
            status=row[3],
            assigned_by_email=row[4],
            assigned_at=row[5],
            started_at=row[6],
            completed_at=row[7],
        )
