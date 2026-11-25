import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, useApi, useFilms, useSettings, whatsappLink, fmtDate, timeAgo, encodeBuild } from '../../lib/api';
import { Swatch } from '../../components/Swatch';
import { STATUSES, WHEELS, CALIPERS, TINT, estimate, money, modelById, modelName } from '../../../shared/catalog.js';
import type { Film, Job, JobEvent, StatusId } from '../../lib/types';

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

type Detail = Job & { events: JobEvent[] };

function JobDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: job, reload, error } = useApi<Detail>(`/admin/jobs/${id}`);
  const { data: films } = useFilms();
  const { data: settings } = useSettings();
  const byId = useMemo(() => Object.fromEntries((films || []).map((f) => [f.id, f])) as Record<string, Film>, [films]);
  const [form, setForm] = useState<Partial<Job>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (job) setForm({ final_price: job.final_price, scheduled_date: job.scheduled_date, bay: job.bay, notes: job.notes, featured: job.featured, phone: job.phone, email: job.email, customer_name: job.customer_name });
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
  const trackUrl = job ? `${location.origin}/track/${job.code}` : '';
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
                {STATUSES.map((s) => (
                  <button key={s.id} disabled={busy} className={`stage-btn ${job.status === s.id ? 'on' : ''} st-${s.id}`} onClick={() => job.status !== s.id && patch({ status: s.id }, `Moved to ${s.label}`)}>
                    {s.label}
                  </button>
                ))}
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
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="d-sec">
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
            </div>
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
