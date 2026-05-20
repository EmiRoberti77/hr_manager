import { Link, Outlet, useLocation } from 'react-router-dom';
import type { DemoUser } from './api';

interface Props {
  demoUsers: DemoUser[];
  demoUser: string;
  setDemoUser: (email: string) => void;
}

export function Layout({ demoUsers, demoUser, setDemoUser }: Props) {
  const location = useLocation();
  const current = demoUsers.find((u) => u.email === demoUser);

  return (
    <div className="layout">
      <header className="top-nav">
        <div className="top-nav-brand">HR platform</div>
        <nav className="top-nav-links">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
            Analytics
          </Link>
          <Link to="/training" className={location.pathname.startsWith('/training') ? 'active' : ''}>
            Training
          </Link>
          <Link to="/policies" className={location.pathname.startsWith('/policies') ? 'active' : ''}>
            Policies
          </Link>
          <Link to="/expenses" className={location.pathname.startsWith('/expenses') ? 'active' : ''}>
            Expenses
          </Link>
        </nav>
        <div className="top-nav-user">
          <label htmlFor="demo-user-select">Signed in as</label>
          <select
            id="demo-user-select"
            value={demoUser}
            onChange={(e) => setDemoUser(e.target.value)}
          >
            {demoUsers.map((u) => (
              <option key={u.email} value={u.email}>
                {u.email} — {u.team}
                {u.role === 'hr_admin' ? ' (HR admin)' : u.role === 'employee' ? ' (employee)' : ''}
              </option>
            ))}
          </select>
          {current?.is_hr_admin && (
            <span className="badge badge-admin">HR admin</span>
          )}
        </div>
      </header>
      <Outlet />
    </div>
  );
}
