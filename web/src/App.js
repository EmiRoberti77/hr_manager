import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { chat, listDemoUsers, resetFrame, } from './api';
import { Chat } from './Chat';
import { ViewRenderer } from './ViewRenderer';
export function App() {
    const [demoUsers, setDemoUsers] = useState([]);
    const [demoUser, setDemoUser] = useState('');
    const [conversationId, setConversationId] = useState(null);
    const [frame, setFrame] = useState(null);
    const [viewSpec, setViewSpec] = useState(null);
    const [data, setData] = useState([]);
    const [turns, setTurns] = useState([]);
    const [sending, setSending] = useState(false);
    useEffect(() => {
        listDemoUsers()
            .then((users) => {
            setDemoUsers(users);
            if (users.length > 0)
                setDemoUser(users[0].email);
        })
            .catch((e) => console.error('Could not load demo users:', e));
    }, []);
    // Switching demo users resets the chat so we don't leak one manager's
    // conversation into another's scope.
    useEffect(() => {
        setConversationId(null);
        setFrame(null);
        setViewSpec(null);
        setData([]);
        setTurns([]);
    }, [demoUser]);
    async function send(message, setActiveEmployee = null) {
        if (!demoUser)
            return;
        setSending(true);
        setTurns((t) => [...t, { role: 'user', text: message }]);
        try {
            const resp = await chat(demoUser, conversationId, message, setActiveEmployee);
            setConversationId(resp.conversation_id);
            setFrame(resp.frame);
            if (resp.view_spec) {
                setViewSpec(resp.view_spec);
                setData(resp.data ?? []);
                setTurns((t) => [...t, { role: 'assistant', text: resp.view_spec.narrative }]);
            }
            else if (resp.error) {
                setTurns((t) => [...t, { role: 'assistant', text: `Error: ${resp.error}` }]);
            }
        }
        catch (e) {
            setTurns((t) => [...t, { role: 'assistant', text: `Request failed: ${String(e)}` }]);
        }
        finally {
            setSending(false);
        }
    }
    function handleRowClick(row) {
        // Find a full_name-shaped column and use its value to set the active employee.
        const nameKey = Object.keys(row).find((k) => k.endsWith('.full_name') || k === 'full_name');
        if (!nameKey)
            return;
        const name = String(row[nameKey]);
        send(`Tell me more about ${name} — role and holiday days taken this year.`, name);
    }
    async function handleResetFrame() {
        if (!conversationId || !demoUser)
            return;
        await resetFrame(demoUser, conversationId);
        setFrame({ active_employee: null, active_team: null, date_range: frame?.date_range ?? '2026' });
        setViewSpec(null);
        setData([]);
    }
    return (_jsxs("div", { className: "app", children: [_jsx(Chat, { demoUsers: demoUsers, demoUser: demoUser, setDemoUser: setDemoUser, frame: frame, onResetFrame: handleResetFrame, turns: turns, sending: sending, onSend: (m) => send(m) }), _jsx("main", { className: "main", children: viewSpec ? (_jsx(ViewRenderer, { spec: viewSpec, data: data, onRowClick: handleRowClick })) : (_jsxs("div", { className: "empty", children: [_jsx("h2", { style: { color: '#374151' }, children: "Ask a question to get started" }), _jsx("p", { children: "Try \u201CShow me the holiday schedule for my team.\u201D" })] })) })] }));
}
