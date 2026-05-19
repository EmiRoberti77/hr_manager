// Training module API client.
const API_BASE = '';
function headers(demoUser) {
    return {
        'Content-Type': 'application/json',
        'X-Demo-User': demoUser,
    };
}
async function request(demoUser, path, init) {
    const r = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { ...headers(demoUser), ...init?.headers },
    });
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`${path}: ${r.status} ${text}`);
    }
    if (r.status === 204)
        return undefined;
    return r.json();
}
export function listCourses(demoUser) {
    return request(demoUser, '/training/courses');
}
export function getCourse(demoUser, courseId) {
    return request(demoUser, `/training/courses/${courseId}`);
}
export function createCourse(demoUser, body) {
    return request(demoUser, '/training/courses', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
export function deleteCourse(demoUser, courseId) {
    return request(demoUser, `/training/courses/${courseId}`, { method: 'DELETE' });
}
export function addVideo(demoUser, courseId, body) {
    return request(demoUser, `/training/courses/${courseId}/videos`, {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
export function deleteVideo(demoUser, videoId) {
    return request(demoUser, `/training/videos/${videoId}`, { method: 'DELETE' });
}
export function listEmployees(demoUser, team) {
    const q = team ? `?team=${encodeURIComponent(team)}` : '';
    return request(demoUser, `/training/employees${q}`);
}
export function createAssignment(demoUser, body) {
    return request(demoUser, '/training/assignments', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
export function listEnrollments(demoUser, courseId) {
    const q = courseId != null ? `?course_id=${courseId}` : '';
    return request(demoUser, `/training/enrollments${q}`);
}
export function updateEnrollment(demoUser, enrollmentId, status) {
    return request(demoUser, `/training/enrollments/${enrollmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    });
}
