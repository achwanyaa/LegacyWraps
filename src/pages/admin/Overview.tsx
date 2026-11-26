import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useApi, timeAgo } from '../../lib/api';
import { Swatch } from '../../components/Swatch';
import { useOnJobsChanged, useOpenJob, StatusBadge } from './JobDrawer';
import { moneyShort, SERVICES } from '../../../shared/catalog.js';
import type { Film, StatusId } from '../../lib/types';

interface Stats {
  open: number;
  openValue: number;
  active: number;
  activeValue: number;
  revenue30: number;
  avgTicket: number;
  conversion: number;
  weeks: { start: string; requests: number; revenue: number }[];
  topFilms: { id: string; n: number; film: Film | null }[];
  activity: { id: number; job_id: number; status: StatusId | null; message: string; created_at: string; customer_name: string; code: string; vehicle: string }[];
  today: { free: number; used: number; bays: number };
}

const weekLabel = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });

/** Single-series bar chart: rounded data-ends on the baseline, recessive grid, per-bar hover tooltip. */
function BarChart({ title, data, format, color }: { title: string; data: { label: string; value: number }[]; format: (n: number) => string; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const h = 180;
  const pad = { l: 52, r: 8, t: 14, b: 26 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = (() => {
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const s = [1, 2, 2.5, 5, 10].find((k) => k * p >= max / 3) || 10;
    return s * p;
  })();
  const top = Math.ceil(max / nice) * nice;
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const band = iw / data.length;
  const bw = Math.min(28, band - 2);
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const ticks = Array.from({ length: Math.round(top / nice) + 1 }, (_, i) => i * nice);
  const last = data.length - 1;

  return (
    <figure className="chart" ref={ref}>
      <figcaption>{title}</figcaption>
      <svg width={w} height={h} role="img" aria-label={`${title}, last ${data.length} weeks`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + band * i + (band - bw) / 2;
          const bh = Math.max(0, y(0) - y(d.value));
          const r = Math.min(4, bh / 2, bw / 2);
          const yy = y(d.value);
          const path = bh > 0 ? `M${x},${y(0)} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + bw - r} Q${x + bw},${yy} ${x + bw},${yy + r} V${y(0)} Z` : '';
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" />
              {path && <path d={path} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />}
              {(i === 0 || i === last || i % 3 === 0) && (
                <text x={x + bw / 2} y={h - 8} className="tick" textAnchor="middle">
                  {d.label}
                </text>
              )}
              {i === last && hover === null && d.value > 0 && (
                <text x={x + bw / 2} y={yy - 6} className="val" textAnchor="middle">
                  {format(d.value)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} className="base" />
      </svg>
      {hover !== null && (
        <div className="tip" style={{ left: Math.min(w - 120, pad.l + band * hover + band / 2), top: y(data[hover].value) - 8 }}>
          <span className="mono">Week of {data[hover].label}</span>
          <strong>{format(data[hover].value)}</strong>
        </div>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th>{d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

type Brief = { id: number; code: string; customer_name: string; vehicle: string | null; status: StatusId; bay: number | null; phone: string | null };
interface Day {
  day: {
    inBays: Brief[];
    arriving: Brief[];
    waiting: { count: number; oldest: Brief[] };
    takenToday: number;
    owed: { total: number; jobs: (Brief & { owed: number })[] };
  };
  money: { today: number; week: number; month: number; expected: number; byService: { service: string; amount: number }[] };
}

/** The owner's phone-first answers: bays, arrivals, unanswered leads, money in, money owed. */
function Today({ s, openJob }: { s: Stats & Day; openJob: (id: number) => void }) {
  const { day, money: m } = s;
  const row = (j: Brief, right?: React.ReactNode) => (
    <button key={j.id} className="today-row" onClick={() => openJob(j.id)}>
      <span>
        <strong>{j.customer_name}</strong> <span className="mute">{j.vehicle}</span>
      </span>
      {right}
    </button>
  );
  return (
    <section className="today">
      <div className="today-card">
        <span className="mono mute">In the bays</span>
        <strong>{day.inBays.length}</strong>
        {day.inBays.map((j) => row(j, <span className="mono mute">{j.bay ? `Bay ${j.bay}` : 'No bay'} · <StatusBadge status={j.status} /></span>))}
      </div>
      <div className="today-card">
        <span className="mono mute">Arriving today</span>
        <strong>{day.arriving.length}</strong>
        {day.arriving.map((j) => row(j, <span className="mono mute">{j.bay ? `Bay ${j.bay}` : 'No bay yet'}</span>))}
      </div>
      <div className={`today-card ${day.waiting.count ? 'alert' : ''}`}>
        <span className="mono mute">Leads not answered</span>
        <strong>{day.waiting.count}</strong>
        {day.waiting.oldest.map((j) => row(j))}
        {day.waiting.count > 0 && (
          <Link className="mono" to="/admin/leads">
            Open leads →
          </Link>
        )}
      </div>
      <div className="today-card">
        <span className="mono mute">Taken today</span>
        <strong>{moneyShort(day.takenToday)}</strong>
        <span className="mute">
          {moneyShort(m.week)} this week · {moneyShort(m.month)} this month
        </span>
        {m.byService.length > 0 && <span className="mute">Month by service: {m.byService.map((b) => `${SERVICES.find((x) => x.id === b.service)?.label || b.service} ${moneyShort(b.amount)}`).join(' · ')}</span>}
      </div>
      <div className={`today-card ${day.owed.total ? 'alert' : ''}`}>
        <span className="mono mute">Still owed</span>
        <strong>{moneyShort(day.owed.total)}</strong>
        <span className="mute">{moneyShort(m.expected)} due from cars booked or in the bay</span>
        {day.owed.jobs.slice(0, 4).map((j) => row(j, <span className="mono">{moneyShort(j.owed)}</span>))}
      </div>
    </section>
  );
}

export default function Overview() {
  const { data: s, reload } = useApi<Stats & Day>('/admin/stats');
  useOnJobsChanged(useCallback(() => void reload(), [reload]));
  const openJob = useOpenJob();
  if (!s)
    return (
      <div className="adm-center">
        <div className="spinner" />
      </div>
    );
  const topMax = Math.max(1, ...s.topFilms.map((t) => t.n));
  const hour = new Date().getHours();
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="mono mute">{new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>Good {hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}.</h1>
        </div>
        <Link className="btn sm accent" to="/admin/pipeline">
          Open pipeline →
        </Link>
      </header>

      <Today s={s} openJob={openJob} />

      <div className="kpis">
        <div className="kpi">
          <span className="mono mute">Open requests</span>
          <strong>{s.open}</strong>
          <span className="mute">{moneyShort(s.openValue)} in quotes</span>
        </div>
        <div className="kpi">
          <span className="mono mute">In progress</span>
          <strong>{s.active}</strong>
          <span className="mute">{moneyShort(s.activeValue)} booked</span>
        </div>
        <div className="kpi">
          <span className="mono mute">Delivered · 30 days</span>
          <strong>{moneyShort(s.revenue30)}</strong>
          <span className="mute">avg ticket {moneyShort(s.avgTicket)}</span>
        </div>
        <div className="kpi">
          <span className="mono mute">Bays today</span>
          <strong>
            {s.today.used}/{s.today.bays}
          </strong>
          <span className="meter" aria-hidden>
            {Array.from({ length: s.today.bays }, (_, i) => (
              <i key={i} className={i < s.today.used ? 'on' : ''} />
            ))}
          </span>
        </div>
        <div className="kpi">
          <span className="mono mute">Request → booked</span>
          <strong>{Math.round(s.conversion * 100)}%</strong>
          <span className="mute">all time</span>
        </div>
      </div>

      <div className="ov-grid">
        <section className="card">
          <BarChart title="Requests per week" data={s.weeks.map((w) => ({ label: weekLabel(w.start), value: w.requests }))} format={(n) => String(Math.round(n))} color="#ecebe6" />
        </section>
        <section className="card">
          <BarChart title="Delivered revenue per week" data={s.weeks.map((w) => ({ label: weekLabel(w.start), value: w.revenue }))} format={(n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))} color="#ff5a1f" />
        </section>
        <section className="card">
          <h2 className="card-title">Most requested films</h2>
          <ol className="rank">
            {s.topFilms.map((t, i) => (
              <li key={t.id}>
                <span className="mono mute">{i + 1}</span>
                <Swatch film={t.film} size={22} />
                <span className="rank-name">
                  {t.film?.name || t.id}
                  <span className="mono mute">{t.film?.brand}</span>
                </span>
                <span className="rank-bar">
                  <i style={{ width: `${(t.n / topMax) * 100}%` }} />
                </span>
                <span className="rank-n">{t.n}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="card">
          <h2 className="card-title">Latest activity</h2>
          <ol className="feed">
            {s.activity.map((a) => (
              <li key={a.id}>
                <button onClick={() => openJob(a.job_id)}>
                  <span className="feed-top">
                    <strong>{a.customer_name}</strong>
                    {a.status && <StatusBadge status={a.status} />}
                    <span className="mono mute">{timeAgo(a.created_at)}</span>
                  </span>
                  <span className="mute">{a.message}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="mono mute foot">Totals use the final price where set, otherwise the studio estimate. All values in KES.</p>
    </div>
  );
}
