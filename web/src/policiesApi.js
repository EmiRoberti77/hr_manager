// Policy document RAG API client.
const API_BASE = '';
function jsonHeaders(demoUser) {
    return {
        'Content-Type': 'application/json',
        'X-Demo-User': demoUser,
    };
}
function authHeaders(demoUser) {
    return { 'X-Demo-User': demoUser };
}
async function request(demoUser, path, init) {
    const r = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { ...jsonHeaders(demoUser), ...init?.headers },
    });
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`${path}: ${r.status} ${text}`);
    }
    if (r.status === 204)
        return undefined;
    return r.json();
}
export function listDocuments(demoUser) {
    return request(demoUser, '/policies/documents');
}
export function uploadDocument(demoUser, form) {
    return fetch(`${API_BASE}/policies/documents`, {
        method: 'POST',
        headers: authHeaders(demoUser),
        body: form,
    }).then(async (r) => {
        if (!r.ok) {
            const text = await r.text();
            throw new Error(`/policies/documents: ${r.status} ${text}`);
        }
        return r.json();
    });
}
export function deleteDocument(demoUser, documentId) {
    return request(demoUser, `/policies/documents/${documentId}`, { method: 'DELETE' });
}
export function policyChat(demoUser, body) {
    return request(demoUser, '/policies/chat', {
        method: 'POST',
        body: JSON.stringify(body),
    });
}
