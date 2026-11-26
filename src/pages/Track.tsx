import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Nav, Footer } from '../components/SiteChrome';
import { Swatch } from '../components/Swatch';
import { api, useFilms, useSettings, whatsappLink, fmtDate, encodeBuild } from '../lib/api';
import { STATUSES, TINT, WHEELS, money } from '../../shared/catalog.js';
import type { BuildConfig, Film, StatusId } from '../lib/types';
import '../styles/track.css';

interface Tracked {
  code: string;
  status: StatusId;
  owner: string;
  vehicle: string;
  config: BuildConfig;
  estimate: number;
  final_price: number | null;
  scheduled_date: string | null;
  snapshot_url: string | null;
  created_at: string;
  events: { status: StatusId | null; message: string; created_at: string }[];
}

export default function Track() {
  const { code } = useParams();
  const nav = useNavigate();
  const [input, setInput] = useState(code || '');
  const [data, setData] = useState<Tracked | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: films } = useFilms();
  const { data: s } = useSettings();
  const byId = useMemo(() => Object.fromEntries((films || []).map((f) => [f.id, f])) as Record<string, Film>, [films]);

  useEffect(() => {
    document.title = code ? `${code} — Track your build` : 'Track your build — Legacy Wraps';
    if (!code) {
      setData(null);
      return;
    }
    let alive = true;
    const load = async (first: boolean) => {
      if (first) setLoading(true);
      try {
        const d = await api<Tracked>(`/track/${encodeURIComponent(code)}`);
        if (alive) {
          setData(d);
          setErr(null);
        }
      } catch (e) {
        if (alive && first) {
          setErr((e as Error).message);
          setData(null);
        }
      } finally {
        if (alive && first) setLoading(false);
      }
    };
    load(true);
    const t = setInterval(() => load(false), 30000); // live-ish updates
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [code]);

  const STEPS = STATUSES.filter((x) => !('closed' in x && x.closed));
  const closed = data ? STATUSES.find((x) => x.id === data.status && 'closed' in x && x.closed) : undefined;
  const idx = data ? STEPS.findIndex((x) => x.id === data.status) : -1;
  const reached = (sid: string) => data?.events.find((e) => e.status === sid);
  const body = data ? byId[data.config.zones.body] : undefined;

  return (
    <>
      <Nav />
      <main className="track wrap">
        <header className="track-head">
          <p className="mono mute">Build tracker</p>
          <h1 className="display">{data ? data.code : 'Track your build'}</h1>
          <form
            className="track-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) nav(`/track/${input.trim().toUpperCase()}`);
            }}
          >
            <input className="input" placeholder="LW-XXXXX" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Build code" autoCapitalize="characters" />
            <button className="btn">Track</button>
          </form>
        </header>

        {loading && (
          <div className="page-loading">
            <div className="spinner" />
          </div>
        )}
        {err && !loading && (
          <div className="track-empty">
            <p>{err} Check the code on your confirmation, or ask us on WhatsApp.</p>
            <a className="btn ghost sm" href={whatsappLink(s?.phone, `Hi, I can't find my build code ${code}.`)} target="_blank" rel="noreferrer">
              WhatsApp us
            </a>
          </div>
        )}
        {!code && !loading && (
          <div className="track-empty">
            <p>Your build code is on your confirmation screen and in our WhatsApp messages. It looks like LW-7K3QP.</p>
            <Link className="btn ghost sm" to="/studio">
              No code yet? Design a build →
            </Link>
          </div>
        )}

        {data && !loading && (
          <div className="track-grid">
            <div className="track-car">
              <div className="track-img">{data.snapshot_url ? <img src={data.snapshot_url} alt={`${data.vehicle} render`} /> : <div className="track-noimg" />}</div>
              <div className="track-spec">
                <div>
                  <span className="mono mute">Vehicle</span>
                  <strong>{data.vehicle}</strong>
                </div>
                <div>
                  <span className="mono mute">Film</span>
                  <strong className="with-sw">
                    <Swatch film={body} size={16} /> {body ? `${body.brand} ${body.name}` : '—'}
                  </strong>
                </div>
                <div>
                  <span className="mono mute">Wheels · tint</span>
                  <strong>
                    {WHEELS.find((w) => w.id === data.config.wheels)?.label} · {TINT[data.config.tint]?.vlt}
                  </strong>
                </div>
                <div>
                  <span className="mono mute">{data.final_price ? 'Quoted price' : 'Estimate'}</span>
                  <strong>{money(data.final_price ?? data.estimate)}</strong>
                </div>
                <div>
                  <span className="mono mute">Install date</span>
                  <strong>{data.scheduled_date ? fmtDate(data.scheduled_date, { weekday: 'long', day: 'numeric', month: 'long' }) : 'To be confirmed'}</strong>
                </div>
              </div>
              <div className="track-actions">
                <Link className="btn ghost sm" to={`/studio?b=${encodeBuild(data.config)}`}>
                  View in 3D
                </Link>
                <a className="btn sm" href={whatsappLink(s?.phone, `Hi Legacy Wraps, checking on build ${data.code}.`)} target="_blank" rel="noreferrer">
                  Message the team
                </a>
              </div>
            </div>

            <div className="track-status">
              <p className="hello">
                Hi {data.owner}, your build is <b>{(closed || STEPS[idx])?.public.toLowerCase()}</b>.
              </p>
              {closed && <p>{closed.blurb}</p>}
              {!closed && <ol className="stepper">
                {STEPS.map((st, n) => {
                  const ev = reached(st.id);
                  const state = n < idx ? 'done' : n === idx ? 'now' : 'next';
                  return (
                    <li key={st.id} className={state}>
                      <span className="step-dot" aria-hidden />
                      <div>
                        <strong>{st.public}</strong>
                        {state === 'now' && <p>{st.blurb}</p>}
                        {ev && <span className="mono mute">{fmtDate(ev.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                      </div>
                    </li>
                  );
                })}
              </ol>}
              {data.events.some((e) => !e.status) && (
                <div className="notes">
                  <p className="mono mute">Updates from the bay</p>
                  {data.events
                    .filter((e) => !e.status)
                    .reverse()
                    .map((e, n) => (
                      <div key={n} className="note">
                        <span className="mono mute">{fmtDate(e.created_at, { day: 'numeric', month: 'short' })}</span>
                        <p>{e.message}</p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
