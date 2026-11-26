import { createContext, lazy, Suspense, useContext, useEffect, useState } from 'react';
import { NavLink, Route, Routes, Link } from 'react-router';
import { api } from '../../lib/api';
import { JobDrawerHost } from './JobDrawer';
import '../../styles/admin.css';

const Overview = lazy(() => import('./Overview'));
const Pipeline = lazy(() => import('./Pipeline'));
const Schedule = lazy(() => import('./Schedule'));
const Films = lazy(() => import('./Films'));
const SettingsPage = lazy(() => import('./SettingsPage'));

export interface StaffMe {
  id: number;
  name: string;
  login: string;
  role: 'owner' | 'staff';
}
const MeContext = createContext<StaffMe | null>(null);
/** The signed-in staff member (null outside the admin shell). */
export const useMe = () => useContext(MeContext);

function Login({ onDone }: { onDone: (me: StaffMe) => void }) {
  const [login, setLogin] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="adm-login">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const r = await api<{ staff: StaffMe }>('/admin/login', { body: { login, password: pw } });
            onDone(r.staff);
          } catch (x) {
            setErr((x as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="mono mute">Legacy Wraps · Staff</p>
        <h1 className="display">Control room</h1>
        <label className="field">
          <span>Username</span>
          <input className="input" autoFocus autoCapitalize="none" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" placeholder="owner" />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </label>
        {err && <p className="adm-err">{err}</p>}
        <button className="btn accent" disabled={busy || !pw}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
        <Link to="/" className="mono mute">
          ← Back to site
        </Link>
      </form>
    </div>
  );
}

const NAV = [
  ['', 'Overview', 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z'],
  ['pipeline', 'Pipeline', 'M3 4h4v16H3V4zm7 0h4v10h-4V4zm7 0h4v13h-4V4z'],
  ['schedule', 'Schedule', 'M7 2v2H4v18h16V4h-3V2h-2v2H9V2H7zm-1 8h12v10H6V10z'],
  ['films', 'Films', 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 110 12 6 6 0 010-12z'],
  ['settings', 'Settings', 'M12 8a4 4 0 100 8 4 4 0 000-8zm8.9 5l2-1.6-2-3.4-2.4.8a8 8 0 00-1.7-1L16.4 5h-4l-.4 2.8a8 8 0 00-1.7 1l-2.4-.8-2 3.4 2 1.6a8 8 0 000 2l-2 1.6 2 3.4 2.4-.8a8 8 0 001.7 1l.4 2.8h4l.4-2.8a8 8 0 001.7-1l2.4.8 2-3.4-2-1.6a8 8 0 000-2z'],
];

export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [me, setMe] = useState<StaffMe | null>(null);
  useEffect(() => {
    document.title = 'Control room — Legacy Wraps';
    api<{ authed: boolean; staff: StaffMe | null }>('/admin/me')
      .then((r) => {
        setMe(r.staff);
        setAuthed(r.authed);
      })
      .catch(() => setAuthed(false));
    const off = () => setAuthed(false);
    window.addEventListener('lw:unauthorized', off);
    return () => window.removeEventListener('lw:unauthorized', off);
  }, []);

  if (authed === null)
    return (
      <div className="adm adm-center">
        <div className="spinner" />
      </div>
    );
  if (!authed)
    return (
      <div className="adm">
        <Login
          onDone={(s) => {
            setMe(s);
            setAuthed(true);
          }}
        />
      </div>
    );

  return (
    <MeContext.Provider value={me}>
    <div className="adm">
      <aside className="adm-side">
        <Link to="/" className="adm-brand">
          <span className="display">LW</span>
          <span className="mono">Control room</span>
        </Link>
        <nav>
          {NAV.map(([to, label, d]) => (
            <NavLink key={label} to={`/admin${to ? '/' + to : ''}`} end={!to}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
                <path d={d} fill="currentColor" />
              </svg>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        {me && (
          <p className="adm-me mono mute">
            {me.name} · {me.role}
          </p>
        )}
        <button
          className="adm-out mono"
          onClick={async () => {
            await api('/admin/logout', { body: {} });
            setAuthed(false);
          }}
        >
          Sign out
        </button>
      </aside>
      <main className="adm-main">
        <Suspense
          fallback={
            <div className="adm-center">
              <div className="spinner" />
            </div>
          }
        >
          <Routes>
            <Route index element={<Overview />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="films" element={<Films />} />
            <Route path="settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </main>
      <JobDrawerHost />
    </div>
    </MeContext.Provider>
  );
}
