import { useEffect, useState } from 'react';
import { api, useApi } from '../../lib/api';
import type { Settings } from '../../lib/types';

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
  const { data } = useApi<Settings>('/admin/settings');
  const [form, setForm] = useState<Partial<Settings>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwMsg, setPwMsg] = useState<string | null>(null);
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
          <h2 className="card-title">Staff password</h2>
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
      </div>
    </div>
  );
}
