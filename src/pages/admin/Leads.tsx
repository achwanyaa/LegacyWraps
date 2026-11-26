import { useCallback, useState } from 'react';
import { api, useApi, timeAgo, whatsappLink, fmtDate } from '../../lib/api';
import { useOnJobsChanged, useOpenJob, notifyJobsChanged, StatusBadge } from './JobDrawer';
import { LEAD_SOURCES, SERVICES, MODELS, moneyShort } from '../../../shared/catalog.js';
import type { Lead } from '../../lib/types';

const sourceLabel = (id: string) => LEAD_SOURCES.find((s) => s.id === id)?.label || id;
const serviceLabel = (id: string | null) => (id ? SERVICES.find((s) => s.id === id)?.label || id : null);
const EMPTY = { name: '', phone: '', source: 'instagram', model: '', vehicle: '', service: 'colour', message: '' };

/** The ten-second lead form: Instagram DMs, calls and walk-ins. */
function AddLead({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="card lead-add"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await api('/admin/leads', { body: f });
          setF({ ...EMPTY, source: f.source });
          onDone();
        } catch (x) {
          setErr((x as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="card-title">Add a lead</h2>
      <label className="field">
        <span>Name</span>
        <input className="input" value={f.name} onChange={set('name')} autoComplete="off" />
      </label>
      <label className="field">
        <span>Phone</span>
        <input className="input" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="07…" />
      </label>
      <label className="field">
        <span>Came from</span>
        <select className="input" value={f.source} onChange={set('source')}>
          {LEAD_SOURCES.filter((s) => s.id !== 'studio' && s.id !== 'website').map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Service</span>
        <select className="input" value={f.service} onChange={set('service')}>
          {SERVICES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Car</span>
        <select className="input" value={f.model} onChange={set('model')}>
          <option value="">Other / not sure</option>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.make} {m.model}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Car details</span>
        <input className="input" value={f.vehicle} onChange={set('vehicle')} placeholder="e.g. 2019 Prado, white" />
      </label>
      <label className="field full">
        <span>What they asked</span>
        <textarea className="input" rows={2} value={f.message} onChange={set('message')} />
      </label>
      {err && <p className="adm-err full">{err}</p>}
      <button className="btn accent sm full" disabled={busy || !f.name || !f.phone}>
        {busy ? 'Saving…' : 'Add lead'}
      </button>
    </form>
  );
}

export default function Leads() {
  const { data, reload } = useApi<{ leads: Lead[]; rules: { followUpHours: number; followUpDays: number } }>('/admin/leads');
  useOnJobsChanged(useCallback(() => void reload(), [reload]));
  const openJob = useOpenJob();
  const [adding, setAdding] = useState(false);
  const leads = data?.leads || [];
  const waiting = leads.filter((l) => l.needs_reply).length;
  const due = leads.filter((l) => l.follow_up_due).length;

  async function contacted(l: Lead) {
    await api(`/admin/jobs/${l.id}`, { method: 'PATCH', body: { contacted: true } });
    notifyJobsChanged();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="mono mute">
            {waiting} waiting for a reply · {due} follow-ups due
          </p>
          <h1>Leads</h1>
        </div>
        <div className="head-tools">
          <button className="btn accent sm" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Close' : '+ Add lead'}
          </button>
        </div>
      </header>
      {adding && (
        <AddLead
          onDone={() => {
            setAdding(false);
            notifyJobsChanged();
          }}
        />
      )}
      {data && !leads.length && <p className="mute">No open requests. New ones from the Studio, Instagram and the form above land here.</p>}
      <div className="lead-list">
        {leads.map((l) => {
          const first = l.customer_name.split(' ')[0];
          const flag = l.overdue_reply ? ['late', `No reply after ${data!.rules.followUpHours}h`] : l.needs_reply ? ['new', 'New, not replied'] : l.follow_up_due ? ['due', 'Follow up today'] : null;
          return (
            <article key={l.id} className={`card lead ${flag ? 'flag-' + flag[0] : ''}`}>
              <button className="lead-main" onClick={() => openJob(l.id)}>
                <div className="lead-top">
                  <strong>{l.customer_name}</strong>
                  <StatusBadge status={l.status} />
                </div>
                <p className="mute">
                  {[l.vehicle, serviceLabel(l.service)].filter(Boolean).join(' · ') || 'No car yet'}
                  {(l.final_price ?? l.estimate) > 0 && <> · {moneyShort(l.final_price ?? l.estimate)}</>}
                </p>
                <p className="mono mute lead-meta">
                  <span className="src">{sourceLabel(l.source)}</span> {timeAgo(l.created_at)}
                  {l.last_contact_at && <> · replied {timeAgo(l.last_contact_at)}</>}
                  {l.next_follow_up_at && !l.follow_up_due && <> · follow up {fmtDate(l.next_follow_up_at, { weekday: 'short', day: 'numeric' })}</>}
                </p>
                {flag && <p className="lead-flag">{flag[1]}</p>}
              </button>
              <div className="lead-actions">
                {l.phone && (
                  <a
                    className="btn sm accent"
                    href={whatsappLink(l.phone, l.status === 'quoted' ? `Hi ${first}, just checking in on the quote for your ${l.vehicle || 'car'}. Any questions?` : `Hi ${first}, thanks for reaching out to Legacy Wraps.`)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => void contacted(l)}
                  >
                    WhatsApp
                  </a>
                )}
                {l.phone && (
                  <a className="btn sm ghost" href={`tel:${l.phone}`} onClick={() => void contacted(l)}>
                    Call
                  </a>
                )}
                <button className="btn sm ghost" onClick={() => void contacted(l)} title="Mark as contacted and set the next follow-up">
                  Done
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
