// Training module API client.

const API_BASE = '';

export interface TrainingCourse {
  id: number;
  title: string;
  description: string;
  category: string;
  created_by_email: string;
  created_at: string;
  video_count: number;
  enrollment_count: number;
}

export interface TrainingVideo {
  id: number;
  course_id: number;
  title: string;
  youtube_url: string;
  youtube_video_id: string;
  position: number;
}

export interface TrainingCourseDetail extends TrainingCourse {
  videos: TrainingVideo[];
}

export type EnrollmentStatus = 'not_started' | 'in_progress' | 'completed';

export interface TrainingEnrollment {
  id: number;
  course_id: number;
  course_title: string;
  employee_id: number;
  employee_name: string;
  employee_team: string;
  status: EnrollmentStatus;
  assigned_by_email: string;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TrainingEmployee {
  id: number;
  full_name: string;
  email: string;
  team: string;
}

function headers(demoUser: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Demo-User': demoUser,
  };
}

async function request<T>(
  demoUser: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers(demoUser), ...init?.headers },
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${path}: ${r.status} ${text}`);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}

export function listCourses(demoUser: string): Promise<TrainingCourse[]> {
  return request(demoUser, '/training/courses');
}

export function getCourse(demoUser: string, courseId: number): Promise<TrainingCourseDetail> {
  return request(demoUser, `/training/courses/${courseId}`);
}

export function createCourse(
  demoUser: string,
  body: { title: string; description: string; category: string },
): Promise<TrainingCourse> {
  return request(demoUser, '/training/courses', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteCourse(demoUser: string, courseId: number): Promise<void> {
  return request(demoUser, `/training/courses/${courseId}`, { method: 'DELETE' });
}

export function addVideo(
  demoUser: string,
  courseId: number,
  body: { title: string; youtube_url: string },
): Promise<TrainingVideo> {
  return request(demoUser, `/training/courses/${courseId}/videos`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteVideo(demoUser: string, videoId: number): Promise<void> {
  return request(demoUser, `/training/videos/${videoId}`, { method: 'DELETE' });
}

export function listEmployees(
  demoUser: string,
  team?: string,
): Promise<TrainingEmployee[]> {
  const q = team ? `?team=${encodeURIComponent(team)}` : '';
  return request(demoUser, `/training/employees${q}`);
}

export function createAssignment(
  demoUser: string,
  body: { course_id: number; team?: string; employee_ids?: number[] },
): Promise<{ assigned: number; employee_count: number }> {
  return request(demoUser, '/training/assignments', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listEnrollments(
  demoUser: string,
  courseId?: number,
): Promise<TrainingEnrollment[]> {
  const q = courseId != null ? `?course_id=${courseId}` : '';
  return request(demoUser, `/training/enrollments${q}`);
}

export function updateEnrollment(
  demoUser: string,
  enrollmentId: number,
  status: EnrollmentStatus,
): Promise<TrainingEnrollment> {
  return request(demoUser, `/training/enrollments/${enrollmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
