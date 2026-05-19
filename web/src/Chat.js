import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Chat sidebar — demo-user picker, context frame, transcript, prompt input.
// "Drill down" is implemented in App.tsx via the onRowClick callback on the
// rendered view; clicking a name sets active_employee in the frame.
import { useEffect, useRef, useState } from 'react';
const SUGGESTIONS = [
    'Show me the holiday schedule for my team',
    'What is my team headcount?',
    'Compare holiday days taken across people in 2025',
    'List everyone who joined this year',
];
export function Chat({ frame, onResetFrame, turns, sending, onSend, }) {
    const [draft, setDraft] = useState('');
    const transcriptRef = useRef(null);
    useEffect(() => {
        transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
    }, [turns]);
    function submit() {
        const m = draft.trim();
        if (!m || sending)
            return;
        setDraft('');
        onSend(m);
    }
    return (_jsxs("aside", { className: "sidebar", children: [_jsxs("header", { children: [_jsx("h1", { children: "HR analytics" }), _jsx("div", { style: { fontSize: 12, color: '#6b7280' }, children: "Ask about headcount, holidays, joiners, individuals." })] }), _jsxs("div", { className: "context-frame", children: [_jsx("h2", { children: "Context frame" }), _jsxs("dl", { children: [_jsx("dt", { children: "Employee" }), _jsx("dd", { children: frame?.active_employee ?? '—' }), _jsx("dt", { children: "Team" }), _jsx("dd", { children: frame?.active_team ?? '—' }), _jsx("dt", { children: "Date range" }), _jsx("dd", { children: frame?.date_range ?? '—' })] }), _jsx("button", { onClick: onResetFrame, children: "Reset frame" })] }), _jsxs("div", { className: "transcript", ref: transcriptRef, children: [turns.length === 0 && (_jsx("div", { style: { color: '#9ca3af', fontSize: 13 }, children: "No messages yet. Try one of the suggestions below." })), turns.map((t, i) => (_jsxs("div", { className: `turn ${t.role}`, children: [t.role === 'user' ? '› ' : '', t.text] }, i))), sending && _jsx("div", { className: "turn assistant", children: "\u2026thinking" })] }), _jsx("div", { className: "suggestions", children: SUGGESTIONS.map((s) => (_jsx("button", { disabled: sending, onClick: () => onSend(s), children: s }, s))) }), _jsxs("div", { className: "composer", children: [_jsx("input", { value: draft, placeholder: "Ask anything about your team\u2026", onChange: (e) => setDraft(e.target.value), onKeyDown: (e) => {
                            if (e.key === 'Enter')
                                submit();
                        }, disabled: sending }), _jsx("button", { onClick: submit, disabled: sending || !draft.trim(), children: "Send" })] })] }));
}
