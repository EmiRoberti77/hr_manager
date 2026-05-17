// Thin client for the FastAPI backend. The X-Demo-User header is the mock
// auth — production would replace this with a real SSO session cookie.
// Empty base so all requests go through Vite's proxy (vite.config.ts).
// In production, replace with the actual API origin.
const API_BASE = '';
function headers(demoUser) {
    return {
        'Content-Type': 'application/json',
        'X-Demo-User': demoUser,
    };
}
export async function listDemoUsers() {
    const r = await fetch(`${API_BASE}/demo-users`);
    if (!r.ok)
        throw new Error(`demo-users: ${r.status}`);
    return r.json();
}
export async function chat(demoUser, conversationId, message, setActiveEmployee = null) {
    const r = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: headers(demoUser),
        body: JSON.stringify({
            conversation_id: conversationId,
            message,
            set_active_employee: setActiveEmployee,
        }),
    });
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`chat ${r.status}: ${text}`);
    }
    return r.json();
}
export async function resetFrame(demoUser, conversationId) {
    const r = await fetch(`${API_BASE}/conversations/reset-frame`, {
        method: 'POST',
        headers: headers(demoUser),
        body: JSON.stringify({ conversation_id: conversationId }),
    });
    if (!r.ok)
        throw new Error(`reset-frame: ${r.status}`);
}
