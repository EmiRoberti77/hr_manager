import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { listDemoUsers, type DemoUser } from './api';
import { App } from './App';
import { Layout } from './Layout';
import { PoliciesPage } from './PoliciesPage';
import { TrainingPage } from './TrainingPage';

export function Root() {
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [demoUser, setDemoUser] = useState('');

  useEffect(() => {
    listDemoUsers()
      .then((users) => {
        setDemoUsers(users);
        if (users.length > 0) setDemoUser(users[0].email);
      })
      .catch((e) => console.error('Could not load demo users:', e));
  }, []);

  if (!demoUser && demoUsers.length === 0) {
    return <div className="empty">Loading…</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <Layout demoUsers={demoUsers} demoUser={demoUser} setDemoUser={setDemoUser} />
          }
        >
          <Route path="/" element={<App demoUser={demoUser} />} />
          <Route
            path="/training"
            element={<TrainingPage demoUser={demoUser} demoUsers={demoUsers} />}
          />
          <Route
            path="/policies"
            element={<PoliciesPage demoUser={demoUser} demoUsers={demoUsers} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
