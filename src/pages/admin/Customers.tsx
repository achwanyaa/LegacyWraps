import { Fragment, useMemo, useState } from 'react';
import { useApi, timeAgo, whatsappLink, fmtDate } from '../../lib/api';
import { useOpenJob, StatusBadge } from './JobDrawer';
import { money } from '../../../shared/catalog.js';
import type { Customer, Job } from '../../lib/types';

function CustomerJobs({ id }: { id: number }) {
  const { data } = useApi<Omit<Customer, 'jobs'> & { jobs: Job[] }>(`/admin/customers/${id}`);
  const openJob = useOpenJob();
  if (!data) return <div className="spinner" />;
  return (
    <div className="cust-jobs">
      {data.jobs.map((j) => (
        <button key={j.id} className="cust-job" onClick={() => openJob(j.id)}>
          <span className="mono mute">{fmtDate(j.created_at, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
          <span>{j.vehicle || 'Car not set'}</span>
          <StatusBadge status={j.status} />
          <span className="mono">{money(j.final_price ?? j.estimate)}</span>
        </button>
      ))}
    </div>
  );
}

export default function Customers() {
  const { data } = useApi<Customer[]>('/admin/customers');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data || []).filter((c) => !s || `${c.name} ${c.phone} ${c.email} ${c.cars.join(' ')}`.toLowerCase().includes(s));
  }, [data, q]);
  const repeat = (data || []).filter((c) => c.jobs > 1).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="mono mute">
            {data?.length ?? '…'} customers · {repeat} with more than one job
          </p>
          <h1>Customers</h1>
        </div>
        <div className="head-tools">
          <input className="input sm" placeholder="Search name, phone, car…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        </div>
      </header>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Cars</th>
              <th className="num">Jobs</th>
              <th className="num">Spent</th>
              <th>Last seen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <Fragment key={c.id}>
                <tr className="row-click" onClick={() => setOpen(open === c.id ? null : c.id)}>
                  <td>
                    <strong>{c.name}</strong>
                    {c.email && <div className="mute">{c.email}</div>}
                  </td>
                  <td className="mono">{c.phone || '—'}</td>
                  <td>{c.cars.join(', ') || '—'}</td>
                  <td className="num">
                    {c.jobs}
                    {c.open > 0 && <span className="mute"> ({c.open} open)</span>}
                  </td>
                  <td className="num mono">{c.spend ? money(c.spend) : '—'}</td>
                  <td className="mute">{timeAgo(c.last_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {c.phone && (
                      <a className="btn sm ghost" href={whatsappLink(c.phone, `Hi ${c.name.split(' ')[0]}, this is Legacy Wraps.`)} target="_blank" rel="noreferrer">
                        WhatsApp
                      </a>
                    )}
                  </td>
                </tr>
                {open === c.id && (
                  <tr>
                    <td colSpan={7}>
                      <CustomerJobs id={c.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
