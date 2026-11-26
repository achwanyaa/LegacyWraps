import { useEffect, useState } from 'react';
import { api, useApi } from '../../lib/api';
import type { Settings } from '../../lib/types';
import { SERVICES } from '../../../shared/catalog.js';

type AdminSettings = Settings & { followUpHours?: number; followUpDays?: number; serviceDays?: Record<string, number> };
import { useMe, type StaffMe } from './me';

type StaffRow = StaffMe & { active: boolean };

function StaffCard() {
  const { data, reload } = useApi<StaffRow[]>('/admin/staff');
  const [add, setAdd] = useState({ name: '', login: '', password: '', role: 'staff' });
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      reload();
    } catch (x) {
      setMsg((x as Error).message);
    }
  };
  return (
    <div className="card d-sec full">
      <h2 className="card-title">Staff</h2>
      <p className="mute" style={{ margin: 0 }}>Everyone signs in with their own username. Staff can run jobs and record payments; only owners change prices, settings, staff and deletions.</p>
      <div style={{ overflowX: 'auto' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(data || []).map((r) => (
            <tr key={r.id} className={r.active ? '' : 'mute'}>
              <td>{r.name}</td>
              <td className="mono">{r.login}</td>
              <td>
                <select className="input" value={r.role} onChange={(e) => run(() => api(`/admin/staff/${r.id}`, { method: 'PATCH', body: { role: e.target.value } }), 'Role updated.')}>
                  <option value="staff">Staff</option>
                  <option value="owner">Owner</option>
                </select>
              </td>
              <td>
                <button
                  className="btn sm"
                  onClick={() => {
                    const pw = window.prompt(`New password for ${r.name} (8+ characters)`);
                    if (pw) run(() => api(`/admin/staff/${r.id}`, { method: 'PATCH', body: { password: pw } }), 'Password reset.');
                  }}
                >
                  Reset password
                </button>{' '}
                <button className="btn sm" onClick={() => run(() => api(`/admin/staff/${r.id}`, { method: 'PATCH', body: { active: !r.active } }), r.active ? 'Access removed.' : 'Access restored.')}>
                  {r.active ? 'Remove access' : 'Restore'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <form
        className="staff-add"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api('/admin/staff', { body: add }), `Added ${add.name}.`).then(() => setAdd({ name: '', login: '', password: '', role: 'staff' }));
        }}
      >
        <label className="field">
          <span>Name</span>
          <input className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Username</span>
          <input className="input" autoCapitalize="none" value={add.login} onChange={(e) => setAdd({ ...add, login: e.target.value })} />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" autoComplete="new-password" value={add.password} onChange={(e) => setAdd({ ...add, password: e.target.value })} />
        </label>
        <label className="field">
          <span>Role</span>
          <select className="input" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}>
            <option value="staff">Staff</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        {msg && <p className="mute full">{msg}</p>}
        <button className="btn accent sm full" disabled={!add.name || !add.login || add.password.length < 8}>
          Add staff member
        </button>
      </form>
    </div>
  );
}

const FIELDS: [keyof Settings, string, string?][] = [
  ['shopName', 'Shop name'],
  ['tagline', 'Tagline'],
  ['phone', 'Phone / WhatsApp', 'Used for every WhatsApp button on the site'],
  ['email', 'Email'],
  ['address', 'Address'],
  ['city', 'City'],
  ['hours', 'Opening hours'],
  ['instagram', 'Instagram handle'],
];

export default function SettingsPage() {
  const { data } = useApi<AdminSettings>('/admin/settings');
  const [form, setForm] = useState<Partial<AdminSettings>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const me = useMe();
  const owner = me?.role === 'owner';
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="mono mute">Shop details and pricing</p>
          <h1>Settings</h1>
        </div>
      </header>
      <div className="settings-grid">
        <form
          className="card d-sec grid2"
          inert={!owner || undefined}
          style={owner ? undefined : { opacity: 0.6 }}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/admin/settings', { method: 'PUT', body: form });
              setMsg('Saved. Reload the public site to see changes.');
            } catch (x) {
              setMsg((x as Error).message);
            }
          }}
        >
          <h2 className="card-title full">Shop</h2>
          {!owner && <p className="mute full">Only an owner can change these.</p>}
          {FIELDS.map(([k, label, hint]) => (
            <label key={k} className={`field ${k === 'tagline' ? 'full' : ''}`}>
              <span>{label}</span>
              <input className="input" value={String(form[k] ?? '')} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              {hint && <small className="mute">{hint}</small>}
            </label>
          ))}
          <h2 className="card-title full">Capacity & pricing</h2>
          <label className="field">
            <span>Bays</span>
            <input className="input" type="number" min={1} max={20} value={form.bays ?? 4} onChange={(e) => setForm({ ...form, bays: Number(e.target.value) })} />
            <small className="mute">Drives the availability calendar</small>
          </label>
          <label className="field">
            <span>Labour multiplier</span>
            <input className="input" type="number" step={0.05} min={0.5} max={3} value={form.labourMultiplier ?? 1} onChange={(e) => setForm({ ...form, labourMultiplier: Number(e.target.value) })} />
            <small className="mute">1.10 raises all studio labour estimates by 10%</small>
          </label>
          <h2 className="card-title full">Leads and bookings</h2>
          <label className="field">
            <span>Flag a new lead after (hours)</span>
            <input className="input" type="number" min={1} max={72} value={form.followUpHours ?? 3} onChange={(e) => setForm({ ...form, followUpHours: Number(e.target.value) })} />
            <small className="mute">Unanswered leads turn orange on the Leads page</small>
          </label>
          <label className="field">
            <span>Follow up a quote after (days)</span>
            <input className="input" type="number" min={1} max={30} value={form.followUpDays ?? 2} onChange={(e) => setForm({ ...form, followUpDays: Number(e.target.value) })} />
          </label>
          {SERVICES.map((s) => (
            <label key={s.id} className="field">
              <span>{s.label}: days in a bay</span>
              <input
                className="input"
                type="number"
                min={1}
                max={30}
                value={form.serviceDays?.[s.id] ?? ''}
                onChange={(e) => setForm({ ...form, serviceDays: { ...(form.serviceDays || {}), [s.id]: Number(e.target.value) } })}
              />
            </label>
          ))}
          {msg && <p className="mute full">{msg}</p>}
          <button className="btn accent sm full">Save settings</button>
        </form>

        <form
          className="card d-sec"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/admin/password', { body: pw });
              setPw({ current: '', next: '' });
              setPwMsg('Password changed.');
            } catch (x) {
              setPwMsg((x as Error).message);
            }
          }}
        >
          <h2 className="card-title">Your password</h2>
          <label className="field">
            <span>Current password</span>
            <input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          </label>
          <label className="field">
            <span>New password</span>
            <input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" minLength={8} />
          </label>
          {pwMsg && <p className="mute">{pwMsg}</p>}
          <button className="btn sm" disabled={!pw.current || pw.next.length < 8}>
            Change password
          </button>
        </form>
        {owner && <StaffCard />}
      </div>
    </div>
  );
}
