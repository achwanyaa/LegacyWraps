import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, useApi, useFilms, useSettings, whatsappLink, fmtDate, timeAgo, encodeBuild } from '../../lib/api';
import { Swatch } from '../../components/Swatch';
import { STATUSES, WHEELS, CALIPERS, TINT, LEAD_SOURCES, SERVICES, estimate, money, modelById, modelName } from '../../../shared/catalog.js';
import type { Film, Job, JobEvent, Quote, StatusId } from '../../lib/types';
import { useMe } from './me';

/** Send a price, then record whether it was won or lost. Each quote keeps the prices it was built from. */
function Quotes({ job, onChange, trackUrl }: { job: Detail; onChange: (label: string) => void; trackUrl: string }) {
  const [amount, setAmount] = useState(String(job.final_price ?? (job.estimate || '')));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const first = job.customer_name.split(' ')[0];
  const send = async () => {
    setBusy(true);
    try {
      await api(`/admin/jobs/${job.id}/quotes`, { body: { amount: Number(amount), note } });
      const text = `Hi ${first}, here is your Legacy Wraps quote for the ${job.vehicle || 'car'}: ${money(Number(amount))}.${note ? ` ${note}` : ''} You can follow it here: ${trackUrl}`;
      if (job.phone) window.open(whatsappLink(job.phone, text), '_blank', 'noreferrer');
      setNote('');
      onChange('Quote saved');
    } catch (e) {
      onChange((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const decide = async (q: Quote, outcome: 'won' | 'lost') => {
    const lost_reason = outcome === 'lost' ? window.prompt('Why was it lost? (price, timing, went elsewhere, no reply...)') : null;
    if (outcome === 'lost' && lost_reason === null) return;
    await api(`/admin/quotes/${q.id}`, { method: 'PATCH', body: { outcome, lost_reason } });
    onChange(outcome === 'won' ? 'Marked won. Book a date when the deposit is in.' : 'Marked lost');
  };
  return (
    <div className="d-sec">
      <div className="d-label mono">Quotes</div>
      <div className="quote-form">
        <label className="field">
          <span>Price (KES)</span>
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
        </label>
        <label className="field">
          <span>Note for the customer</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. includes door shuts, 5-day turnaround" />
        </label>
        <button className="btn accent sm" disabled={busy || !(Number(amount) > 0)} onClick={send}>
          {job.phone ? 'Save and send on WhatsApp' : 'Save quote'}
        </button>
      </div>
      {job.quotes.length > 0 && (
        <ul className="quotes">
          {job.quotes.map((q) => (
            <li key={q.id} className={`q-${q.outcome}`}>
              <span className="mono">{money(q.amount)}</span>
              <span className="mute">
                {fmtDate(q.sent_at, { day: 'numeric', month: 'short' })}
                {q.staff?.name ? ` · ${q.staff.name}` : ''}
                {q.note ? ` · ${q.note}` : ''}
                {q.lost_reason ? ` · ${q.lost_reason}` : ''}
              </span>
              {q.outcome === 'open' ? (
                <span className="row-btns">
                  <button className="btn sm" onClick={() => decide(q, 'won')}>
                    Won
                  </button>
                  <button className="btn sm ghost" onClick={() => decide(q, 'lost')}>
                    Lost
                  </button>
                </span>
              ) : (
                <span className={`q-out mono`}>{q.outcome}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const JOBS_CHANGED = 'lw:jobs-changed';
export const notifyJobsChanged = () => window.dispatchEvent(new Event(JOBS_CHANGED));

/** Re-run `fn` whenever any job is edited anywhere in the admin. */
export function useOnJobsChanged(fn: () => void) {
  useEffect(() => {
    window.addEventListener(JOBS_CHANGED, fn);
    return () => window.removeEventListener(JOBS_CHANGED, fn);
  }, [fn]);
}

export function useOpenJob() {
  const [params, setParams] = useSearchParams();
  return (id: number) => {
    const next = new URLSearchParams(params);
    next.set('job', String(id));
    setParams(next);
  };
}

export function StatusBadge({ status }: { status: StatusId }) {
  const s = STATUSES.find((x) => x.id === status);
  return <span className={`st st-${status}`}>{s?.label}</span>;
}

export function JobDrawerHost() {
  const [params, setParams] = useSearchParams();
  const id = params.get('job');
  if (!id) return null;
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete('job');
    setParams(next);
  };
  return <JobDrawer key={id} id={Number(id)} onClose={close} />;
}

interface Payment {
  id: number;
  amount: number;
  method: 'cash' | 'mpesa' | 'bank' | 'card';
  kind: 'deposit' | 'payment' | 'balance' | 'refund';
  reference: string | null;
  paid_at: string;
  staff?: { name: string } | null;
}
type Detail = Job & {
  events: JobEvent[];
  quotes: Quote[];
  customer: { id: number; name: string } | null;
  payments: Payment[];
  paid: number;
  balance: number;
  length: number;
};
const METHOD_LABEL = { cash: 'Cash', mpesa: 'M-Pesa', bank: 'Bank', card: 'Card' } as const;

/** Staff record money in; only the owner can remove a payment. Every change is logged. */
function Payments({ job, onChange, owner }: { job: Detail; onChange: (label: string) => void; owner: boolean }) {
  const [f, setF] = useState({ amount: '', method: 'mpesa', kind: job.paid ? 'balance' : 'deposit', reference: '' });
  const [busy, setBusy] = useState(false);
  const price = job.final_price ?? job.estimate;
  const add = async () => {
    setBusy(true);
    try {
      await api(`/admin/jobs/${job.id}/payments`, { body: { ...f, amount: Number(f.amount) } });
      setF({ amount: '', method: f.method, kind: 'balance', reference: '' });
      onChange('Payment recorded');
    } catch (e) {
      onChange((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="d-sec">
      <div className="d-label mono">Payments</div>
      <div className="pay-sum">
        <span>
          Price <b className="mono">{money(price)}</b>
        </span>
        <span>
          Paid <b className="mono">{money(job.paid)}</b>
        </span>
        <span className={job.balance > 0 ? 'owed' : 'clear'}>
          {job.balance > 0 ? 'Owes' : job.balance < 0 ? 'Overpaid' : 'Paid in full'} {job.balance !== 0 && <b className="mono">{money(Math.abs(job.balance))}</b>}
        </span>
      </div>
      <div className="pay-form">
        <input className="input" inputMode="numeric" placeholder={job.balance > 0 ? String(job.balance) : 'Amount'} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d]/g, '') })} aria-label="Amount (KES)" />
        <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} aria-label="Method">
          {Object.entries(METHOD_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Type">
          <option value="deposit">Deposit</option>
          <option value="payment">Part payment</option>
          <option value="balance">Balance</option>
          <option value="refund">Refund</option>
        </select>
        <input className="input" placeholder={f.method === 'mpesa' ? 'M-Pesa code' : 'Reference'} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} aria-label="Reference" />
        <button className="btn accent sm" disabled={busy || !Number(f.amount)} onClick={add}>
          Record payment
        </button>
      </div>
      {job.payments.length > 0 && (
        <ul className="quotes">
          {job.payments.map((p) => (
            <li key={p.id}>
              <span className="mono">{money(p.amount)}</span>
              <span className="mute">
                {fmtDate(p.paid_at, { day: 'numeric', month: 'short' })} · {METHOD_LABEL[p.method]} · {p.kind}
                {p.reference ? ` · ${p.reference}` : ''}
                {p.staff?.name ? ` · ${p.staff.name}` : ''}
              </span>
              {owner ? (
                <button
                  className="btn sm ghost"
                  onClick={async () => {
                    if (!confirm(`Remove the ${money(p.amount)} payment? This is logged.`)) return;
                    await api(`/admin/payments/${p.id}`, { method: 'DELETE' });
                    onChange('Payment removed');
                  }}
                >
                  Remove
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
const toDateInput = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-CA') : '');

function JobDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: job, reload, error } = useApi<Detail>(`/admin/jobs/${id}`);
  const { data: films } = useFilms();
  const { data: settings } = useSettings();
  const byId = useMemo(() => Object.fromEntries((films || []).map((f) => [f.id, f])) as Record<string, Film>, [films]);
  const [form, setForm] = useState<Partial<Job>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const me = useMe();

  useEffect(() => {
    if (job)
      setForm({
        final_price: job.final_price,
        scheduled_date: job.scheduled_date,
        bay: job.bay,
        notes: job.notes,
        featured: job.featured,
        phone: job.phone,
        email: job.email,
        customer_name: job.customer_name,
        source: job.source,
        service: job.service,
        next_follow_up_at: toDateInput(job.next_follow_up_at),
        days: job.days,
      });
  }, [job]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2000);
    return () => clearTimeout(t);
  }, [msg]);

  async function patch(body: Record<string, unknown>, label = 'Saved') {
    setBusy(true);
    try {
      await api(`/admin/jobs/${id}`, { method: 'PATCH', body });
      await reload();
      notifyJobsChanged();
      setMsg(label);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const est = job && films ? estimate(job.config, byId, { labourMultiplier: settings?.labourMultiplier }) : null;
  const cfg = job?.config;
  const m = cfg ? modelById(cfg.model) : null;
  const trackUrl = job ? `${location.origin}/track/${job.track_token || job.code}` : "";
  const bays = Number(settings?.bays) || 4;
  const set = (k: keyof Job) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Job details">
        <button className="drawer-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        {error && <p className="adm-err">{error}</p>}
        {!job && !error && <div className="spinner" />}
        {job && cfg && m && (
          <>
            <div className="drawer-img">{job.snapshot_url ? <img src={job.snapshot_url} alt="" /> : null}</div>
            <div className="drawer-head">
              <span className="mono mute">
                {job.code} · {timeAgo(job.created_at)}
              </span>
              <h2>{job.customer_name}</h2>
              <p className="mute">{job.vehicle || modelName(m)}</p>
            </div>

            <div className="d-sec">
              <div className="d-label mono">Stage</div>
              <div className="stages">
                {STATUSES.filter((s) => !('closed' in s && s.closed)).map((s) => (
                  <button key={s.id} disabled={busy} className={`stage-btn ${job.status === s.id ? 'on' : ''} st-${s.id}`} onClick={() => job.status !== s.id && patch({ status: s.id }, `Moved to ${s.label}`)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="stages closed-stages">
                {STATUSES.filter((s) => 'closed' in s && s.closed).map((s) => (
                  <button
                    key={s.id}
                    disabled={busy}
                    className={`stage-btn ${job.status === s.id ? 'on' : ''} st-${s.id}`}
                    onClick={() => {
                      if (job.status === s.id) return;
                      const reason = s.id === 'lost' ? window.prompt('Why was it lost? (price, timing, went elsewhere, no reply...)', job.lost_reason || '') : '';
                      if (reason === null) return;
                      patch({ status: s.id, ...(s.id === 'lost' ? { lost_reason: reason } : {}) }, `Marked ${s.label}`);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
                {job.status === 'lost' && job.lost_reason && <span className="mute">Reason: {job.lost_reason}</span>}
              </div>
              <p className="hint">Changing the stage posts an update to the customer's tracker.</p>
            </div>

            <div className="d-sec grid2">
              <label className="field">
                <span>Final price (KES)</span>
                <input className="input" inputMode="numeric" value={form.final_price ?? ''} onChange={set('final_price')} placeholder={String(job.estimate)} />
              </label>
              <label className="field">
                <span>Install date</span>
                <input className="input" type="date" value={form.scheduled_date ?? ''} onChange={set('scheduled_date')} />
              </label>
              <label className="field">
                <span>Bay</span>
                <select className="input" value={form.bay ?? ''} onChange={set('bay')}>
                  <option value="">Unassigned</option>
                  {Array.from({ length: bays }, (_, n) => (
                    <option key={n} value={n + 1}>
                      Bay {n + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toggle">
                <input type="checkbox" checked={!!form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))} />
                <span>Show on homepage</span>
              </label>
              <label className="field">
                <span>Days in the bay</span>
                <input className="input" inputMode="numeric" value={form.days ?? ''} onChange={set('days')} placeholder={`${job.length} (standard)`} />
              </label>
              <label className="field">
                <span>Name</span>
                <input className="input" value={form.customer_name ?? ''} onChange={set('customer_name')} />
              </label>
              <label className="field">
                <span>Phone</span>
                <input className="input" type="tel" value={form.phone ?? ''} onChange={set('phone')} />
              </label>
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" value={form.email ?? ''} onChange={set('email')} />
              </label>
              <label className="field">
                <span>Came from</span>
                <select className="input" value={form.source ?? 'other'} onChange={set('source')}>
                  {LEAD_SOURCES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Service</span>
                <select className="input" value={form.service ?? ''} onChange={set('service')}>
                  <option value="">Not set</option>
                  {SERVICES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Next follow-up</span>
                <input className="input" type="date" value={form.next_follow_up_at ?? ''} onChange={set('next_follow_up_at')} />
              </label>
              {job.source_detail && <p className="mute full">Source detail: {job.source_detail}</p>}
              <label className="field full">
                <span>Internal notes</span>
                <textarea className="input" value={form.notes ?? ''} onChange={set('notes')} />
              </label>
              <button
                className="btn accent sm full"
                disabled={busy}
                onClick={() =>
                  patch({
                    final_price: form.final_price === '' as unknown ? null : form.final_price,
                    scheduled_date: form.scheduled_date || null,
                    bay: form.bay === ('' as unknown) ? null : form.bay,
                    notes: form.notes,
                    featured: form.featured,
                    customer_name: form.customer_name,
                    phone: form.phone,
                    email: form.email,
                    source: form.source,
                    service: form.service || null,
                    next_follow_up_at: form.next_follow_up_at || null,
                    days: form.days === ('' as unknown) || form.days == null ? null : Number(form.days),
                  })
                }
              >
                Save changes
              </button>
            </div>

            <div className="d-sec">
              <div className="d-label mono">Customer</div>
              <div className="cust">
                <span>{job.phone || 'No phone'}</span>
                <span>{job.email}</span>
                {job.preferred_date && <span className="mute">Prefers drop-off {fmtDate(job.preferred_date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
              </div>
              {job.message && <blockquote>{job.message}</blockquote>}
              <div className="row-btns">
                {job.phone && (
                  <a className="btn sm" href={whatsappLink(job.phone, `Hi ${job.customer_name.split(' ')[0]}, this is Legacy Wraps about your ${job.vehicle}. Track your build here: ${trackUrl}`)} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                )}
                <a className="btn ghost sm" href={`mailto:${job.email}?subject=Your Legacy Wraps build ${job.code}`}>
                  Email
                </a>
                <a className="btn ghost sm" href={`/studio?b=${encodeBuild(cfg)}`} target="_blank" rel="noreferrer">
                  Open in Studio
                </a>
                <button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(trackUrl).then(() => setMsg('Tracker link copied'))}>
                  Copy tracker link
                </button>
              </div>
            </div>

            <div className="d-sec">
              <div className="d-label mono">Build spec</div>
              <dl className="spec">
                <dt>Vehicle</dt>
                <dd>{modelName(m)} {cfg.year && `(${cfg.year})`}</dd>
                {(['body', 'roof', 'hood', 'mirrors'] as const).map((z) =>
                  cfg.zones[z] ? (
                    <FilmRow key={z} label={z === 'hood' ? 'Bonnet' : z[0].toUpperCase() + z.slice(1)} film={byId[cfg.zones[z]!]} />
                  ) : null,
                )}
                {cfg.stripes !== 'none' && <FilmRow label={cfg.stripes === 'twin' ? 'Twin stripes' : 'Stripe'} film={byId[cfg.stripeFilm]} />}
                <dt>Wheels</dt>
                <dd>{WHEELS.find((w) => w.id === cfg.wheels)?.label}</dd>
                <dt>Calipers</dt>
                <dd>{CALIPERS.find((c) => c.id === cfg.calipers)?.label}</dd>
                <dt>Tint</dt>
                <dd>{TINT[cfg.tint]?.vlt}</dd>
                <dt>PPF</dt>
                <dd>{cfg.ppf === 'none' ? '—' : `${cfg.ppf === 'full' ? 'Full body' : 'Full front'}, ${cfg.ppfFinish}`}</dd>
                <dt>Extras</dt>
                <dd>{[cfg.chromeDelete && 'Chrome delete', cfg.ceramic && 'Ceramic'].filter(Boolean).join(', ') || '—'}</dd>
                <dt>Plate</dt>
                <dd className="mono">{cfg.plate}</dd>
              </dl>
              {est && (
                <ul className="est">
                  {est.lines.map((l) => (
                    <li key={l.key}>
                      <span>{l.label}</span>
                      <span>{money(l.amount)}</span>
                    </li>
                  ))}
                  <li className="tot">
                    <span>Studio estimate</span>
                    <span>{money(job.estimate)}</span>
                  </li>
                </ul>
              )}
            </div>

            {(job.payments.length > 0 || !['inquiry', 'lost'].includes(job.status)) && (
              <Payments
                job={job}
                owner={me?.role === 'owner'}
                onChange={async (label) => {
                  await reload();
                  notifyJobsChanged();
                  setMsg(label);
                }}
              />
            )}

            {['inquiry', 'quoted', 'lost'].includes(job.status) && (
              <Quotes
                job={job}
                trackUrl={trackUrl}
                onChange={async (label) => {
                  await reload();
                  notifyJobsChanged();
                  setMsg(label);
                }}
              />
            )}

            <div className="d-sec">
              <div className="d-label mono">Updates</div>
              <form
                className="post"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!note.trim()) return;
                  await api(`/admin/jobs/${id}/events`, { body: { message: note } });
                  setNote('');
                  await reload();
                  notifyJobsChanged();
                  setMsg('Update posted to tracker');
                }}
              >
                <input className="input" placeholder="Post an update the customer will see…" value={note} onChange={(e) => setNote(e.target.value)} />
                <button className="btn sm">Post</button>
              </form>
              <ol className="events">
                {job.events.map((ev) => (
                  <li key={ev.id}>
                    <span className="mono mute">{fmtDate(ev.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span>
                      {ev.status && <StatusBadge status={ev.status} />} {ev.message}
                      {ev.staff?.name && <span className="mute"> · {ev.staff.name}</span>}
                      {!ev.public && <span className="mute"> · internal</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {me?.role === 'owner' && <div className="d-sec">
              <button
                className="danger"
                onClick={async () => {
                  if (!confirm(`Delete ${job.code} for ${job.customer_name}? This cannot be undone.`)) return;
                  await api(`/admin/jobs/${id}`, { method: 'DELETE' });
                  notifyJobsChanged();
                  onClose();
                }}
              >
                Delete job
              </button>
            </div>}
          </>
        )}
        {msg && <div className="toast">{msg}</div>}
      </aside>
    </div>
  );
}

function FilmRow({ label, film }: { label: string; film?: Film }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="with-sw">
        <Swatch film={film} size={14} /> {film ? `${film.brand} ${film.name}` : 'Unknown film'}
      </dd>
    </>
  );
}
