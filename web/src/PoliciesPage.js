import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteDocument, listDocuments, policyChat, uploadDocument, } from './policiesApi';
const TEAMS = ['Engineering', 'Sales', 'People'];
const CATEGORIES = [
    'general',
    'holiday',
    'expenses',
    'travel',
    'safety',
    'benefits',
    'conduct',
];
function statusBadgeClass(status) {
    switch (status) {
        case 'ready':
            return 'badge-ready';
        case 'processing':
            return 'badge-processing';
        case 'failed':
            return 'badge-failed';
    }
}
export function PoliciesPage({ demoUser, demoUsers }) {
    const isHrAdmin = demoUsers.find((u) => u.email === demoUser)?.is_hr_admin ?? false;
    const currentTeam = demoUsers.find((u) => u.email === demoUser)?.team ?? '';
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [uploadTitle, setUploadTitle] = useState('');
    const [uploadTeam, setUploadTeam] = useState('Engineering');
    const [uploadCategory, setUploadCategory] = useState('general');
    const [uploadFile, setUploadFile] = useState(null);
    const [conversationId, setConversationId] = useState();
    const [turns, setTurns] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [chatSending, setChatSending] = useState(false);
    const chatEndRef = useRef(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const docs = await listDocuments(demoUser);
            setDocuments(docs);
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setLoading(false);
        }
    }, [demoUser]);
    useEffect(() => {
        load();
    }, [load]);
    useEffect(() => {
        const hasProcessing = documents.some((d) => d.status === 'processing');
        if (!hasProcessing)
            return;
        const timer = setInterval(load, 4000);
        return () => clearInterval(timer);
    }, [documents, load]);
    useEffect(() => {
        setConversationId(undefined);
        setTurns([]);
        setChatInput('');
    }, [demoUser]);
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [turns, chatSending]);
    async function handleUpload(e) {
        e.preventDefault();
        if (!uploadFile || !uploadTitle.trim())
            return;
        setSaving(true);
        setError(null);
        try {
            const form = new FormData();
            form.append('title', uploadTitle.trim());
            form.append('team', uploadTeam);
            form.append('category', uploadCategory);
            form.append('file', uploadFile);
            await uploadDocument(demoUser, form);
            setUploadTitle('');
            setUploadFile(null);
            await load();
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setSaving(false);
        }
    }
    async function handleDelete(id) {
        if (!confirm('Delete this policy document and all its indexed content?'))
            return;
        try {
            await deleteDocument(demoUser, id);
            await load();
        }
        catch (err) {
            setError(String(err));
        }
    }
    async function handleChat(e) {
        e.preventDefault();
        const message = chatInput.trim();
        if (!message || chatSending)
            return;
        setChatInput('');
        setChatSending(true);
        setTurns((prev) => [...prev, { role: 'user', content: message }]);
        setError(null);
        try {
            const res = await policyChat(demoUser, {
                message,
                conversation_id: conversationId,
            });
            setConversationId(res.conversation_id);
            setTurns((prev) => [
                ...prev,
                { role: 'assistant', content: res.answer, sources: res.sources },
            ]);
        }
        catch (err) {
            setError(String(err));
            setTurns((prev) => prev.slice(0, -1));
        }
        finally {
            setChatSending(false);
        }
    }
    return (_jsxs("div", { className: "policies-page", children: [_jsxs("header", { className: "policies-header", children: [_jsx("h1", { children: "Policy documents" }), _jsxs("p", { children: ["Ask questions about HR policies for your team (", currentTeam, "). Answers are grounded in uploaded PDFs with citations.", isHrAdmin && ' As HR admin you can upload PDFs per team.'] })] }), error && (_jsxs("div", { className: "policies-error", role: "alert", children: [error, _jsx("button", { type: "button", onClick: () => setError(null), children: "Dismiss" })] })), loading && documents.length === 0 && _jsx("p", { className: "policies-loading", children: "Loading\u2026" }), _jsxs("div", { className: "policies-grid", children: [_jsxs("section", { className: "policies-panel", children: [_jsx("h2", { children: "Documents" }), documents.length === 0 && !loading && (_jsxs("p", { className: "muted", children: ["No policy documents yet", isHrAdmin ? ' — upload a PDF below.' : '.'] })), _jsx("ul", { className: "policy-doc-list", children: documents.map((doc) => (_jsxs("li", { className: "policy-doc-item", children: [_jsxs("div", { className: "policy-doc-main", children: [_jsx("strong", { children: doc.title }), _jsxs("span", { className: "muted", children: [doc.team, " \u00B7 ", doc.category] }), _jsx("span", { className: `badge ${statusBadgeClass(doc.status)}`, children: doc.status }), doc.status === 'failed' && doc.error_message && (_jsx("span", { className: "policy-doc-error", children: doc.error_message }))] }), isHrAdmin && (_jsx("button", { type: "button", className: "btn-link-danger", onClick: () => handleDelete(doc.id), children: "Delete" }))] }, doc.id))) }), isHrAdmin && (_jsxs("form", { className: "policies-form", onSubmit: handleUpload, children: [_jsx("h3", { children: "Upload PDF" }), _jsx("input", { placeholder: "Title", value: uploadTitle, onChange: (e) => setUploadTitle(e.target.value), required: true }), _jsx("select", { value: uploadTeam, onChange: (e) => setUploadTeam(e.target.value), children: TEAMS.map((t) => (_jsx("option", { value: t, children: t }, t))) }), _jsx("select", { value: uploadCategory, onChange: (e) => setUploadCategory(e.target.value), children: CATEGORIES.map((c) => (_jsx("option", { value: c, children: c }, c))) }), _jsx("input", { type: "file", accept: "application/pdf,.pdf", onChange: (e) => setUploadFile(e.target.files?.[0] ?? null), required: true }), _jsx("button", { type: "submit", disabled: saving || !uploadFile, children: saving ? 'Uploading…' : 'Upload & index' })] }))] }), _jsxs("section", { className: "policies-panel policies-panel-chat", children: [_jsx("h2", { children: "Ask about policies" }), _jsxs("div", { className: "policy-chat-transcript", children: [turns.length === 0 && (_jsx("p", { className: "muted", children: "Try: \"What is the holiday entitlement?\" or \"What is the travel expense policy?\"" })), turns.map((turn, i) => (_jsxs("div", { className: `policy-turn policy-turn-${turn.role}`, children: [_jsx("p", { children: turn.content }), turn.sources && turn.sources.length > 0 && (_jsxs("details", { className: "policy-sources", children: [_jsxs("summary", { children: ["Sources (", turn.sources.length, ")"] }), _jsx("ul", { children: turn.sources.map((s, j) => (_jsxs("li", { children: [_jsx("strong", { children: s.document_title }), s.page_number != null && ` — page ${s.page_number}`, _jsx("p", { className: "muted", children: s.excerpt })] }, j))) })] }))] }, i))), _jsx("div", { ref: chatEndRef })] }), _jsxs("form", { className: "policy-chat-form", onSubmit: handleChat, children: [_jsx("input", { placeholder: "Ask a policy question\u2026", value: chatInput, onChange: (e) => setChatInput(e.target.value), disabled: chatSending }), _jsx("button", { type: "submit", disabled: chatSending || !chatInput.trim(), children: chatSending ? 'Thinking…' : 'Send' })] })] })] })] }));
}
