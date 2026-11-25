import { useCallback, useMemo, useState } from 'react';
import { api, useApi, fmtDate, timeAgo } from '../../lib/api';
import { useOnJobsChanged, useOpenJob, notifyJobsChanged } from './JobDrawer';
import { STATUSES, moneyShort } from '../../../shared/catalog.js';
import type { Job, StatusId } from '../../lib/types';

export default function Pipeline() {
  const { data: jobs, reload, setData } = useApi<Job[]>('/admin/jobs');
  useOnJobsChanged(useCallback(() => void reload(), [reload]));
  const openJob = useOpenJob();
  const [q, setQ] = useState('');
  const [hideDone, setHideDone] = useState(true);
  const [over, setOver] = useState<StatusId | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (jobs || []).filter((j) => !s || `${j.customer_name} ${j.vehicle} ${j.code} ${j.phone}`.toLowerCase().includes(s));
  }, [jobs, q]);
  const cols = (STATUSES as { id: StatusId; label: string }[]).filter((s) => !(hideDone && s.id === 'delivered'));

  async function move(id: number, status: StatusId) {
    const job = jobs?.find((j) => j.id === id);
    if (!job || job.status === status) return;
    setData((list) => list?.map((j) => (j.id === id ? { ...j, status } : j))); // optimistic
    try {
      await api(`/admin/jobs/${id}`, { method: 'PATCH', body: { status } });
      notifyJobsChanged();
    } catch {
      reload();
    }
  }

  return (
    <div className="page wide">
      <header className="page-head">
        <div>
          <p className="mono mute">{jobs ? `${jobs.length} jobs` : 'Loading…'}</p>
          <h1>Pipeline</h1>
        </div>
        <div className="head-tools">
          <input className="input sm" placeholder="Search name, car, code…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search jobs" />
          <label className="toggle">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
            <span>Hide delivered</span>
          </label>
        </div>
      </header>
      <p className="hint">Drag a card to move it. Customers see each move on their tracker.</p>
      <div className="board">
        {cols.map((col) => {
          const list = filtered.filter((j) => j.status === col.id);
          const sum = list.reduce((s, j) => s + (j.final_price ?? j.estimate), 0);
          return (
            <section
              key={col.id}
              className={`col ${over === col.id ? 'over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                move(Number(e.dataTransfer.getData('text/plain')), col.id);
              }}
            >
              <header>
                <span className={`st st-${col.id}`}>{col.label}</span>
                <span className="mono mute">
                  {list.length} · {moneyShort(sum)}
                </span>
              </header>
              <div className="col-body">
                {list.map((j) => (
                  <button
                    key={j.id}
                    className="card-job"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(j.id))}
                    onClick={() => openJob(j.id)}
                  >
                    {j.snapshot_url && <img src={j.snapshot_url} alt="" loading="lazy" />}
                    <strong>{j.customer_name}</strong>
                    <span className="mute">{j.vehicle}</span>
                    <span className="cj-foot">
                      <span>{moneyShort(j.final_price ?? j.estimate)}</span>
                      <span className="mono mute">{j.scheduled_date ? `${fmtDate(j.scheduled_date)} · B${j.bay ?? '?'}` : timeAgo(j.created_at)}</span>
                    </span>
                  </button>
                ))}
                {!list.length && <div className="col-empty mono mute">Empty</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
