import { useCallback, useMemo, useState } from 'react';
import { useApi, useSettings, fmtDate } from '../../lib/api';
import { useOnJobsChanged, useOpenJob } from './JobDrawer';
import type { Job } from '../../lib/types';

const DAYS = 14;
const iso = (d: Date) => d.toISOString().slice(0, 10);
function addDays(s: string, n: number) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export default function Schedule() {
  const [from, setFrom] = useState(() => iso(new Date()));
  const { data: jobs, reload } = useApi<Job[]>('/admin/jobs');
  const { data: sched, reload: reloadSched } = useApi<{ days: { date: string; free: number; used: number; closed: boolean }[]; jobDays: number }>(`/admin/schedule?from=${from}`);
  const { data: settings } = useSettings();
  useOnJobsChanged(
    useCallback(() => {
      reload();
      reloadSched();
    }, [reload, reloadSched]),
  );
  const openJob = useOpenJob();
  const bays = Number(settings?.bays) || 4;
  const span = sched?.jobDays || 3;
  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  const today = iso(new Date());

  const active = useMemo(() => (jobs || []).filter((j) => ['booked', 'in_bay', 'curing', 'ready'].includes(j.status)), [jobs]);
  const placed = active.filter((j) => j.scheduled_date && j.bay);
  const unplaced = active.filter((j) => !j.scheduled_date || !j.bay);
  const waiting = (jobs || []).filter((j) => j.status === 'quoted' && j.preferred_date);

  return (
    <div className="page wide">
      <header className="page-head">
        <div>
          <p className="mono mute">
            {fmtDate(from, { day: 'numeric', month: 'short' })} – {fmtDate(addDays(from, DAYS - 1), { day: 'numeric', month: 'short' })}
          </p>
          <h1>Bay schedule</h1>
        </div>
        <div className="head-tools">
          <button className="btn ghost sm" onClick={() => setFrom(addDays(from, -7))}>
            ← Week
          </button>
          <button className="btn ghost sm" onClick={() => setFrom(iso(new Date()))}>
            Today
          </button>
          <button className="btn ghost sm" onClick={() => setFrom(addDays(from, 7))}>
            Week →
          </button>
        </div>
      </header>

      <div className="sched-wrap">
        <div className="sched" style={{ gridTemplateColumns: `72px repeat(${DAYS}, minmax(70px, 1fr))`, gridTemplateRows: `auto repeat(${bays}, 64px) auto` }}>
          <div className="sched-corner" />
          {days.map((d, i) => {
            const info = sched?.days.find((x) => x.date === d);
            return (
              <div key={d} className={`sched-day ${d === today ? 'today' : ''} ${info?.closed ? 'closed' : ''}`} style={{ gridColumn: i + 2 }}>
                <span className="mono">{fmtDate(d, { weekday: 'short' })}</span>
                <strong>{fmtDate(d, { day: 'numeric' })}</strong>
              </div>
            );
          })}
          {Array.from({ length: bays }, (_, b) => (
            <div key={b} className="sched-bay mono" style={{ gridRow: b + 2 }}>
              Bay {b + 1}
            </div>
          ))}
          {Array.from({ length: bays }, (_, b) =>
            days.map((d, i) => <div key={`${b}-${d}`} className={`sched-cell ${sched?.days.find((x) => x.date === d)?.closed ? 'closed' : ''}`} style={{ gridRow: b + 2, gridColumn: i + 2 }} />),
          )}
          {placed.map((j) => {
            const start = Math.round((Date.parse(j.scheduled_date! + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
            const s = Math.max(0, start);
            const e = Math.min(DAYS, start + span);
            if (e <= 0 || s >= DAYS || (j.bay ?? 0) > bays) return null;
            return (
              <button key={j.id} className={`sched-job st-${j.status}`} style={{ gridRow: (j.bay as number) + 1, gridColumn: `${s + 2} / ${e + 2}` }} onClick={() => openJob(j.id)} title={`${j.customer_name} — ${j.vehicle}`}>
                <strong>{j.customer_name}</strong>
                <span>{j.vehicle}</span>
              </button>
            );
          })}
          <div className="sched-bay mono" style={{ gridRow: bays + 2 }}>
            Free
          </div>
          {days.map((d, i) => {
            const info = sched?.days.find((x) => x.date === d);
            return (
              <div key={d} className="sched-free mono" style={{ gridRow: bays + 2, gridColumn: i + 2 }}>
                {info?.closed ? '—' : info?.free}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sched-lists">
        <section className="card">
          <h2 className="card-title">Booked, needs a bay or date</h2>
          {!unplaced.length && <p className="mute">Everything booked has a slot.</p>}
          {unplaced.map((j) => (
            <button key={j.id} className="line-btn" onClick={() => openJob(j.id)}>
              <strong>{j.customer_name}</strong> <span className="mute">{j.vehicle}</span>
            </button>
          ))}
        </section>
        <section className="card">
          <h2 className="card-title">Quoted, with a preferred date</h2>
          {!waiting.length && <p className="mute">No pending preferences.</p>}
          {waiting.map((j) => (
            <button key={j.id} className="line-btn" onClick={() => openJob(j.id)}>
              <strong>{j.customer_name}</strong> <span className="mute">{j.vehicle}</span>
              <span className="mono">{fmtDate(j.preferred_date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
