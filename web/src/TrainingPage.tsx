import { useCallback, useEffect, useState } from 'react';
import type { DemoUser } from './api';
import { YouTubeEmbed } from './YouTubeEmbed';
import {
  addVideo,
  createAssignment,
  createCourse,
  deleteCourse,
  deleteVideo,
  getCourse,
  listCourses,
  listEnrollments,
  updateEnrollment,
  type EnrollmentStatus,
  type TrainingCourse,
  type TrainingCourseDetail,
  type TrainingEnrollment,
  type TrainingVideo,
} from './trainingApi';

interface Props {
  demoUser: string;
  demoUsers: DemoUser[];
}

const TEAMS = ['Engineering', 'Sales', 'People'];

function statusLabel(status: EnrollmentStatus): string {
  switch (status) {
    case 'not_started':
      return 'Not started';
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
  }
}

export function TrainingPage({ demoUser, demoUsers }: Props) {
  const isHrAdmin = demoUsers.find((u) => u.email === demoUser)?.is_hr_admin ?? false;

  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [courseDetail, setCourseDetail] = useState<TrainingCourseDetail | null>(null);
  const [enrollments, setEnrollments] = useState<TrainingEnrollment[]>([]);
  const [watchVideo, setWatchVideo] = useState<TrainingVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin forms
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('enrollment');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [assignTeam, setAssignTeam] = useState('Engineering');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [courseList, enrollmentList] = await Promise.all([
        listCourses(demoUser),
        listEnrollments(demoUser),
      ]);
      setCourses(courseList);
      setEnrollments(enrollmentList);
      if (selectedCourseId != null) {
        const detail = await getCourse(demoUser, selectedCourseId);
        setCourseDetail(detail);
      } else {
        setCourseDetail(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [demoUser, selectedCourseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function selectCourse(id: number) {
    setSelectedCourseId(id);
    setWatchVideo(null);
    try {
      const detail = await getCourse(demoUser, id);
      setCourseDetail(detail);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const created = await createCourse(demoUser, {
        title: newTitle.trim(),
        description: newDescription.trim(),
        category: newCategory,
      });
      setNewTitle('');
      setNewDescription('');
      await load();
      setSelectedCourseId(created.id);
      await selectCourse(created.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddVideo(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCourseId || !videoTitle.trim() || !videoUrl.trim()) return;
    setSaving(true);
    try {
      await addVideo(demoUser, selectedCourseId, {
        title: videoTitle.trim(),
        youtube_url: videoUrl.trim(),
      });
      setVideoTitle('');
      setVideoUrl('');
      await selectCourse(selectedCourseId);
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCourseId) return;
    setSaving(true);
    try {
      await createAssignment(demoUser, { course_id: selectedCourseId, team: assignTeam });
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCourse(id: number) {
    if (!confirm('Delete this course and all videos/enrollments?')) return;
    try {
      await deleteCourse(demoUser, id);
      if (selectedCourseId === id) {
        setSelectedCourseId(null);
        setCourseDetail(null);
      }
      await load();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDeleteVideo(videoId: number) {
    if (!selectedCourseId) return;
    try {
      await deleteVideo(demoUser, videoId);
      if (watchVideo?.id === videoId) setWatchVideo(null);
      await selectCourse(selectedCourseId);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleStatusChange(enrollmentId: number, status: EnrollmentStatus) {
    try {
      await updateEnrollment(demoUser, enrollmentId, status);
      await load();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="training-page">
      <div className="training-header">
        <h1>HR Training</h1>
        <p>
          {isHrAdmin
            ? 'Manage courses, add YouTube videos, and assign training to teams.'
            : 'View training assigned to your team and track completion progress.'}
        </p>
      </div>

      {error && (
        <div className="training-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {loading && <p className="training-loading">Loading…</p>}

      <div className="training-grid">
        <section className="training-panel">
          <h2>Courses</h2>
          {courses.length === 0 && !loading && (
            <p className="muted">No courses yet{isHrAdmin ? ' — create one below.' : '.'}</p>
          )}
          <ul className="course-list">
            {courses.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={selectedCourseId === c.id ? 'course-item active' : 'course-item'}
                  onClick={() => selectCourse(c.id)}
                >
                  <strong>{c.title}</strong>
                  <span className="muted">{c.category}</span>
                  <span className="course-meta">
                    {c.video_count} video{c.video_count !== 1 ? 's' : ''} · {c.enrollment_count}{' '}
                    enrolled
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {isHrAdmin && (
            <form className="training-form" onSubmit={handleCreateCourse}>
              <h3>New course</h3>
              <input
                placeholder="Title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
              />
              <textarea
                placeholder="Description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
              />
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                <option value="enrollment">Enrollment</option>
                <option value="onboarding">Onboarding</option>
                <option value="management">Management</option>
                <option value="compliance">Compliance</option>
                <option value="general">General</option>
              </select>
              <button type="submit" disabled={saving}>
                Create course
              </button>
            </form>
          )}
        </section>

        <section className="training-panel training-panel-wide">
          {courseDetail ? (
            <>
              <div className="course-detail-header">
                <div>
                  <h2>{courseDetail.title}</h2>
                  <p className="muted">{courseDetail.description}</p>
                </div>
                {isHrAdmin && (
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={() => handleDeleteCourse(courseDetail.id)}
                  >
                    Delete course
                  </button>
                )}
              </div>

              <h3>Videos</h3>
              {courseDetail.videos.length === 0 && (
                <p className="muted">No videos yet.</p>
              )}
              <ul className="video-list">
                {courseDetail.videos.map((v) => (
                  <li key={v.id} className="video-item">
                    <button type="button" onClick={() => setWatchVideo(v)}>
                      {v.title}
                    </button>
                    {isHrAdmin && (
                      <button
                        type="button"
                        className="btn-link-danger"
                        onClick={() => handleDeleteVideo(v.id)}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {watchVideo && (
                <div className="watch-block">
                  <h4>{watchVideo.title}</h4>
                  <YouTubeEmbed videoId={watchVideo.youtube_video_id} title={watchVideo.title} />
                </div>
              )}

              {isHrAdmin && (
                <>
                  <form className="training-form" onSubmit={handleAddVideo}>
                    <h3>Add YouTube video</h3>
                    <input
                      placeholder="Video title"
                      value={videoTitle}
                      onChange={(e) => setVideoTitle(e.target.value)}
                      required
                    />
                    <input
                      placeholder="YouTube URL"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      required
                    />
                    <button type="submit" disabled={saving}>
                      Add video
                    </button>
                  </form>

                  <form className="training-form" onSubmit={handleAssign}>
                    <h3>Assign to team</h3>
                    <select value={assignTeam} onChange={(e) => setAssignTeam(e.target.value)}>
                      {TEAMS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button type="submit" disabled={saving}>
                      Assign course
                    </button>
                  </form>
                </>
              )}
            </>
          ) : (
            <div className="empty">
              <p>Select a course to view videos and details.</p>
            </div>
          )}
        </section>

        <section className="training-panel training-panel-wide">
          <h2>Enrollments</h2>
          {enrollments.length === 0 && !loading && (
            <p className="muted">No enrollments yet.</p>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Team</th>
                <th>Course</th>
                <th>Status</th>
                {!isHrAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => (
                <tr key={e.id}>
                  <td>{e.employee_name}</td>
                  <td>{e.employee_team}</td>
                  <td>{e.course_title}</td>
                  <td>
                    <span className={`badge badge-${e.status}`}>{statusLabel(e.status)}</span>
                  </td>
                  {!isHrAdmin && (
                    <td className="enrollment-actions">
                      {e.status === 'not_started' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(e.id, 'in_progress')}
                        >
                          Start
                        </button>
                      )}
                      {e.status === 'in_progress' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(e.id, 'completed')}
                        >
                          Complete
                        </button>
                      )}
                      {e.status === 'completed' && (
                        <span className="muted">Done</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
