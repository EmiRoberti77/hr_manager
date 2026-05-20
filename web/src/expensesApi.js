// Employee expenses API client.
const API_BASE = '';
function authHeaders(demoUser) {
    return { 'X-Demo-User': demoUser };
}
function jsonHeaders(demoUser) {
    return {
        'Content-Type': 'application/json',
        'X-Demo-User': demoUser,
    };
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
export function listExpenses(demoUser) {
    return request(demoUser, '/expenses');
}
export function getExpense(demoUser, expenseId) {
    return request(demoUser, `/expenses/${expenseId}`);
}
export function uploadReceipt(demoUser, file) {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${API_BASE}/expenses/receipts`, {
        method: 'POST',
        headers: authHeaders(demoUser),
        body: form,
    }).then(async (r) => {
        if (!r.ok) {
            const text = await r.text();
            throw new Error(`/expenses/receipts: ${r.status} ${text}`);
        }
        return r.json();
    });
}
export function updateExpense(demoUser, expenseId, body) {
    return request(demoUser, `/expenses/${expenseId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });
}
export function submitExpense(demoUser, expenseId) {
    return request(demoUser, `/expenses/${expenseId}/submit`, { method: 'POST' });
}
export function deleteExpense(demoUser, expenseId) {
    return request(demoUser, `/expenses/${expenseId}`, { method: 'DELETE' });
}
