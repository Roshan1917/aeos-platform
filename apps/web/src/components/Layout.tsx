import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/cn';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', exact: true },
  { to: '/agents', label: 'Agents' },
  { to: '/uops', label: 'Units of Potential' },
  { to: '/processes', label: 'Processes' },
  { to: '/telemetry', label: 'Telemetry' },
  { to: '/recommendations', label: 'Recommendations' },
  { to: '/test-cases', label: 'Test Cases' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const { claims, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full">
      <aside className="w-60 shrink-0 border-r border-gray-200 bg-canvas-card">
        <div className="px-4 py-5">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-brand grid place-items-center text-white text-sm font-bold">A</div>
            <div>
              <div className="text-sm font-semibold leading-none">AEOS</div>
              <div className="text-xs text-ink-muted leading-none mt-0.5">Reference UI</div>
            </div>
          </div>
        </div>
        <nav className="px-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  'block rounded-md px-3 py-1.5 text-sm font-medium',
                  isActive ? 'bg-brand-subtle text-brand' : 'text-ink-subtle hover:bg-canvas-subtle',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-canvas-card px-6">
          <div className="text-sm">
            <span className="text-ink-muted">tenant </span>
            <span className="font-mono text-ink">{claims?.tenant_id ?? '—'}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm">
              <span className="font-medium">{claims?.sub ?? ''}</span>
              <span className="ml-2 text-xs text-ink-muted">{claims?.roles.join(', ')}</span>
            </div>
            <button onClick={onLogout} className="btn-ghost text-xs">
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-canvas px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
