import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { YouTubeEmbed } from './YouTubeEmbed';
import { addVideo, createAssignment, createCourse, deleteCourse, deleteVideo, getCourse, listCourses, listEnrollments, updateEnrollment, } from './trainingApi';
const TEAMS = ['Engineering', 'Sales', 'People'];
function statusLabel(status) {
    switch (status) {
        case 'not_started':
            return 'Not started';
        case 'in_progress':
            return 'In progress';
        case 'completed':
            return 'Completed';
    }
}
export function TrainingPage({ demoUser, demoUsers }) {
    const isHrAdmin = demoUsers.find((u) => u.email === demoUser)?.is_hr_admin ?? false;
    const [courses, setCourses] = useState([]);
    const [selectedCourseId, setSelectedCourseId] = useState(null);
    const [courseDetail, setCourseDetail] = useState(null);
    const [enrollments, setEnrollments] = useState([]);
    const [watchVideo, setWatchVideo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
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
            }
            else {
                setCourseDetail(null);
            }
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setLoading(false);
        }
    }, [demoUser, selectedCourseId]);
    useEffect(() => {
        load();
    }, [load]);
    async function selectCourse(id) {
        setSelectedCourseId(id);
        setWatchVideo(null);
        try {
            const detail = await getCourse(demoUser, id);
            setCourseDetail(detail);
        }
        catch (e) {
            setError(String(e));
        }
    }
    async function handleCreateCourse(e) {
        e.preventDefault();
        if (!newTitle.trim())
            return;
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
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setSaving(false);
        }
    }
    async function handleAddVideo(e) {
        e.preventDefault();
        if (!selectedCourseId || !videoTitle.trim() || !videoUrl.trim())
            return;
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
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setSaving(false);
        }
    }
    async function handleAssign(e) {
        e.preventDefault();
        if (!selectedCourseId)
            return;
        setSaving(true);
        try {
            await createAssignment(demoUser, { course_id: selectedCourseId, team: assignTeam });
            await load();
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setSaving(false);
        }
    }
    async function handleDeleteCourse(id) {
        if (!confirm('Delete this course and all videos/enrollments?'))
            return;
        try {
            await deleteCourse(demoUser, id);
            if (selectedCourseId === id) {
                setSelectedCourseId(null);
                setCourseDetail(null);
            }
            await load();
        }
        catch (err) {
            setError(String(err));
        }
    }
    async function handleDeleteVideo(videoId) {
        if (!selectedCourseId)
            return;
        try {
            await deleteVideo(demoUser, videoId);
            if (watchVideo?.id === videoId)
                setWatchVideo(null);
            await selectCourse(selectedCourseId);
        }
        catch (err) {
            setError(String(err));
        }
    }
    async function handleStatusChange(enrollmentId, status) {
        try {
            await updateEnrollment(demoUser, enrollmentId, status);
            await load();
        }
        catch (err) {
            setError(String(err));
        }
    }
    return (_jsxs("div", { className: "training-page", children: [_jsxs("div", { className: "training-header", children: [_jsx("h1", { children: "HR Training" }), _jsx("p", { children: isHrAdmin
                            ? 'Manage courses, add YouTube videos, and assign training to teams.'
                            : 'View training assigned to your team and track completion progress.' })] }), error && (_jsxs("div", { className: "training-error", role: "alert", children: [error, _jsx("button", { type: "button", onClick: () => setError(null), children: "Dismiss" })] })), loading && _jsx("p", { className: "training-loading", children: "Loading\u2026" }), _jsxs("div", { className: "training-grid", children: [_jsxs("section", { className: "training-panel", children: [_jsx("h2", { children: "Courses" }), courses.length === 0 && !loading && (_jsxs("p", { className: "muted", children: ["No courses yet", isHrAdmin ? ' — create one below.' : '.'] })), _jsx("ul", { className: "course-list", children: courses.map((c) => (_jsx("li", { children: _jsxs("button", { type: "button", className: selectedCourseId === c.id ? 'course-item active' : 'course-item', onClick: () => selectCourse(c.id), children: [_jsx("strong", { children: c.title }), _jsx("span", { className: "muted", children: c.category }), _jsxs("span", { className: "course-meta", children: [c.video_count, " video", c.video_count !== 1 ? 's' : '', " \u00B7 ", c.enrollment_count, ' ', "enrolled"] })] }) }, c.id))) }), isHrAdmin && (_jsxs("form", { className: "training-form", onSubmit: handleCreateCourse, children: [_jsx("h3", { children: "New course" }), _jsx("input", { placeholder: "Title", value: newTitle, onChange: (e) => setNewTitle(e.target.value), required: true }), _jsx("textarea", { placeholder: "Description", value: newDescription, onChange: (e) => setNewDescription(e.target.value), rows: 2 }), _jsxs("select", { value: newCategory, onChange: (e) => setNewCategory(e.target.value), children: [_jsx("option", { value: "enrollment", children: "Enrollment" }), _jsx("option", { value: "onboarding", children: "Onboarding" }), _jsx("option", { value: "management", children: "Management" }), _jsx("option", { value: "compliance", children: "Compliance" }), _jsx("option", { value: "general", children: "General" })] }), _jsx("button", { type: "submit", disabled: saving, children: "Create course" })] }))] }), _jsx("section", { className: "training-panel training-panel-wide", children: courseDetail ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "course-detail-header", children: [_jsxs("div", { children: [_jsx("h2", { children: courseDetail.title }), _jsx("p", { className: "muted", children: courseDetail.description })] }), isHrAdmin && (_jsx("button", { type: "button", className: "btn-danger", onClick: () => handleDeleteCourse(courseDetail.id), children: "Delete course" }))] }), _jsx("h3", { children: "Videos" }), courseDetail.videos.length === 0 && (_jsx("p", { className: "muted", children: "No videos yet." })), _jsx("ul", { className: "video-list", children: courseDetail.videos.map((v) => (_jsxs("li", { className: "video-item", children: [_jsx("button", { type: "button", onClick: () => setWatchVideo(v), children: v.title }), isHrAdmin && (_jsx("button", { type: "button", className: "btn-link-danger", onClick: () => handleDeleteVideo(v.id), children: "Remove" }))] }, v.id))) }), watchVideo && (_jsxs("div", { className: "watch-block", children: [_jsx("h4", { children: watchVideo.title }), _jsx(YouTubeEmbed, { videoId: watchVideo.youtube_video_id, title: watchVideo.title })] })), isHrAdmin && (_jsxs(_Fragment, { children: [_jsxs("form", { className: "training-form", onSubmit: handleAddVideo, children: [_jsx("h3", { children: "Add YouTube video" }), _jsx("input", { placeholder: "Video title", value: videoTitle, onChange: (e) => setVideoTitle(e.target.value), required: true }), _jsx("input", { placeholder: "YouTube URL", value: videoUrl, onChange: (e) => setVideoUrl(e.target.value), required: true }), _jsx("button", { type: "submit", disabled: saving, children: "Add video" })] }), _jsxs("form", { className: "training-form", onSubmit: handleAssign, children: [_jsx("h3", { children: "Assign to team" }), _jsx("select", { value: assignTeam, onChange: (e) => setAssignTeam(e.target.value), children: TEAMS.map((t) => (_jsx("option", { value: t, children: t }, t))) }), _jsx("button", { type: "submit", disabled: saving, children: "Assign course" })] })] }))] })) : (_jsx("div", { className: "empty", children: _jsx("p", { children: "Select a course to view videos and details." }) })) }), _jsxs("section", { className: "training-panel training-panel-wide", children: [_jsx("h2", { children: "Enrollments" }), enrollments.length === 0 && !loading && (_jsx("p", { className: "muted", children: "No enrollments yet." })), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Employee" }), _jsx("th", { children: "Team" }), _jsx("th", { children: "Course" }), _jsx("th", { children: "Status" }), !isHrAdmin && _jsx("th", { children: "Actions" })] }) }), _jsx("tbody", { children: enrollments.map((e) => (_jsxs("tr", { children: [_jsx("td", { children: e.employee_name }), _jsx("td", { children: e.employee_team }), _jsx("td", { children: e.course_title }), _jsx("td", { children: _jsx("span", { className: `badge badge-${e.status}`, children: statusLabel(e.status) }) }), !isHrAdmin && (_jsxs("td", { className: "enrollment-actions", children: [e.status === 'not_started' && (_jsx("button", { type: "button", onClick: () => handleStatusChange(e.id, 'in_progress'), children: "Start" })), e.status === 'in_progress' && (_jsx("button", { type: "button", onClick: () => handleStatusChange(e.id, 'completed'), children: "Complete" })), e.status === 'completed' && (_jsx("span", { className: "muted", children: "Done" }))] }))] }, e.id))) })] })] })] })] }));
}
