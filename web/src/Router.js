import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { listDemoUsers } from './api';
import { App } from './App';
import { Layout } from './Layout';
import { PoliciesPage } from './PoliciesPage';
import { TrainingPage } from './TrainingPage';
export function Root() {
    const [demoUsers, setDemoUsers] = useState([]);
    const [demoUser, setDemoUser] = useState('');
    useEffect(() => {
        listDemoUsers()
            .then((users) => {
            setDemoUsers(users);
            if (users.length > 0)
                setDemoUser(users[0].email);
        })
            .catch((e) => console.error('Could not load demo users:', e));
    }, []);
    if (!demoUser && demoUsers.length === 0) {
        return _jsx("div", { className: "empty", children: "Loading\u2026" });
    }
    return (_jsx(BrowserRouter, { children: _jsx(Routes, { children: _jsxs(Route, { element: _jsx(Layout, { demoUsers: demoUsers, demoUser: demoUser, setDemoUser: setDemoUser }), children: [_jsx(Route, { path: "/", element: _jsx(App, { demoUser: demoUser }) }), _jsx(Route, { path: "/training", element: _jsx(TrainingPage, { demoUser: demoUser, demoUsers: demoUsers }) }), _jsx(Route, { path: "/policies", element: _jsx(PoliciesPage, { demoUser: demoUser, demoUsers: demoUsers }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }) }) }));
}
