import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CarScene, ENVS, has3d, zonesFor, type ViewName, type SceneStatus } from '../three/CarScene';
import { Logo } from '../components/SiteChrome';
import { Swatch } from '../components/Swatch';
import { api, useApi, useFilms, useSettings, encodeBuild, decodeBuild, whatsappLink, fmtDate } from '../lib/api';
import {
  MODELS, MAKE_GROUPS, CLASSES, FINISHES, WHEELS, CALIPERS, TINT, DEFAULT_CONFIG,
  normalizeConfig, estimate, money, modelById, modelName, vehicleLabel,
} from '../../shared/catalog.js';
import type { BuildConfig, EnvName, Film, VehicleModel } from '../lib/types';
import '../styles/studio.css';

type Zone = 'roof' | 'hood';

function initialConfig(params: URLSearchParams): BuildConfig {
  const b = params.get('b');
  const fromLink = b ? decodeBuild(b) : null;
  const base = normalizeConfig(fromLink || DEFAULT_CONFIG) as BuildConfig;
  const film = params.get('film');
  const model = params.get('model');
  if (film) base.zones = { ...base.zones, body: film };
  if (model) base.model = model;
  return normalizeConfig(base) as BuildConfig;
}

function Section({ n, title, aside, children }: { n: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ps">
      <header className="ps-head">
        <span className="mono mute">{n}</span>
        <h2>{title}</h2>
        {aside && <span className="ps-aside">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilmPicker({ films, value, onPick, size = 40, allowNone, noneLabel = 'Match body' }: { films: Film[]; value: string | null; onPick: (id: string | null) => void; size?: number; allowNone?: boolean; noneLabel?: string }) {
  return (
    <div className="swatches" style={{ '--sw': `${size}px` } as React.CSSProperties}>
      {allowNone && (
        <button className={`sw-btn none ${value === null ? 'on' : ''}`} onClick={() => onPick(null)} title={noneLabel} aria-label={noneLabel} aria-pressed={value === null}>
          <span className="sw-none">=</span>
        </button>
      )}
      {films.map((f) => (
        <button
          key={f.id}
          className={`sw-btn ${value === f.id ? 'on' : ''}`}
          onClick={() => onPick(f.id)}
          disabled={!f.in_stock}
          title={`${f.brand} ${f.name}${f.in_stock ? '' : ' — back soon'}`}
          aria-label={`${f.brand} ${f.name}`}
          aria-pressed={value === f.id}
        >
          <Swatch film={f} size={size} />
        </button>
      ))}
    </div>
  );
}

function QuoteModal({ cfg, total, onClose, snap }: { cfg: BuildConfig; total: number; onClose: () => void; snap: () => string | null }) {
  const { data: days } = useApi<{ date: string; free: number; closed: boolean }[]>('/availability');
  const { data: s } = useSettings();
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '', preferred_date: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ code: string }>('/quote', { body: { ...form, config: cfg, snapshot: snap() } });
      setDone(r);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="qtitle" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        {done ? (
          <div className="done">
            <p className="mono mute">Request sent</p>
            <h2 className="display" id="qtitle">
              You're in the queue.
            </h2>
            <p>We'll confirm your final price on WhatsApp within working hours. Keep your build code to follow along:</p>
            <div className="code display">{done.code}</div>
            <div className="done-cta">
              <Link className="btn" to={`/track/${done.code}`}>
                Track this build →
              </Link>
              <a className="btn ghost" href={whatsappLink(s?.phone, `Hi Legacy Wraps, my build code is ${done.code}.`)} target="_blank" rel="noreferrer">
                WhatsApp us
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="mono mute">Request this build</p>
            <h2 className="display" id="qtitle">
              {vehicleLabel(cfg)}
            </h2>
            <p className="mute">Estimate {money(total)}. Final price confirmed after we see the car.</p>
            <div className="form-grid">
              <label className="field">
                <span>Your name</span>
                <input className="input" required value={form.name} onChange={set('name')} autoComplete="name" />
              </label>
              <label className="field">
                <span>Phone / WhatsApp</span>
                <input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+254 7…" autoComplete="tel" />
              </label>
              <label className="field full">
                <span>Email</span>
                <input className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
              </label>
            </div>
            <div className="field">
              <span>Preferred drop-off</span>
              <div className="days">
                {!days && <div className="spinner" />}
                {days
                  ?.filter((d) => !d.closed)
                  .slice(0, 18)
                  .map((d) => (
                    <button
                      type="button"
                      key={d.date}
                      disabled={!d.free}
                      className={`day ${form.preferred_date === d.date ? 'on' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, preferred_date: f.preferred_date === d.date ? '' : d.date }))}
                    >
                      <span className="mono">{fmtDate(d.date, { weekday: 'short' })}</span>
                      <strong>{fmtDate(d.date, { day: 'numeric' })}</strong>
                      <span className={`day-load ${d.free <= 1 ? 'low' : ''}`}>{d.free ? `${d.free} bay${d.free > 1 ? 's' : ''}` : 'Full'}</span>
                    </button>
                  ))}
              </div>
            </div>
            <label className="field">
              <span>Anything else?</span>
              <textarea className="input" value={form.message} onChange={set('message')} placeholder="Door shuts, badge removal, timing…" />
            </label>
            {err && <p className="err">{err}</p>}
            <button className="btn accent submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send request'} <span className="arrow">→</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Studio() {
  const [params, setParams] = useSearchParams();
  const { data: filmList, error: filmErr } = useFilms();
  const { data: settings } = useSettings();
  const [cfg, setCfg] = useState<BuildConfig>(() => initialConfig(params));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CarScene | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SceneStatus>({ loading: true, progress: 0 });
  const [rotate, setRotate] = useState(false);
  const [view, setView] = useState<ViewName>('hero');
  const [finish, setFinish] = useState('all');
  const [make, setMake] = useState(() => MAKE_GROUPS.find((g) => g.match(modelById(cfg.model)))?.id || 'mercedes');
  const [zone, setZone] = useState<Zone>('roof');
  const [quote, setQuote] = useState(false);
  const [breakdown, setBreakdown] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const films = useMemo(() => filmList || [], [filmList]);
  const byId = useMemo(() => Object.fromEntries(films.map((f) => [f.id, f])) as Record<string, Film>, [films]);
  const model = modelById(cfg.model) as VehicleModel;
  const est = useMemo(() => estimate(cfg, byId, { labourMultiplier: settings?.labourMultiplier }), [cfg, byId, settings]);
  const body = byId[cfg.zones.body];
  const update = (patch: Partial<BuildConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const setZoneFilm = (z: keyof BuildConfig['zones'], id: string | null) => setCfg((c) => ({ ...c, zones: { ...c.zones, [z]: id } }));

  useEffect(() => {
    document.title = 'Studio — Legacy Wraps';
  }, []);

  // Boot the 3D scene once films arrive.
  useEffect(() => {
    if (!filmList || !canvasRef.current) return;
    const s = new CarScene(canvasRef.current, { interactive: true });
    s.onStatus = setStatus;
    s.setFilms(filmList);
    sceneRef.current = s;
    s.setConfig(cfg);
    requestAnimationFrame(() => setReady(true));
    return () => {
      s.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmList]);

  useEffect(() => {
    sceneRef.current?.setConfig(cfg);
    const t = setTimeout(() => setParams({ b: encodeBuild(cfg) }, { replace: true }), 400);
    return () => clearTimeout(t);
  }, [cfg, setParams]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = films.filter((f) => finish === 'all' || f.finish === finish);
  const modelsInMake = MODELS.filter((m) => MAKE_GROUPS.find((g) => g.id === make)?.match(m));

  function surprise() {
    const pool = films.filter((f) => f.in_stock);
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const f = pick(pool);
    const contrast = Math.random() < 0.45 ? pick(pool.filter((x) => x.finish === 'gloss' || x.finish === 'carbon'))?.id || null : null;
    update({
      zones: { body: f.id, roof: zones.includes('roof') ? contrast : null, hood: zones.includes('hood') && !zones.includes('roof') ? contrast : null, mirrors: null },
      wheels: pick(WHEELS).id,
      calipers: pick(CALIPERS).id,
    });
  }
  async function share() {
    const url = `${location.origin}/studio?b=${encodeBuild(cfg)}`;
    const text = `My ${vehicleLabel(cfg)} in ${body?.name || 'a new wrap'} — Legacy Wraps Studio`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Legacy Wraps build', text, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    await navigator.clipboard?.writeText(url);
    setToast('Link copied — send it to anyone');
  }
  function download() {
    const s = sceneRef.current;
    if (!s) return;
    const a = document.createElement('a');
    a.href = s.snapshot(1920, 1080, 'image/png');
    a.download = `legacy-${cfg.model}-${cfg.zones.body}.png`;
    a.click();
  }
  const env = ENVS[cfg.env];
  const zones = zonesFor(cfg.model);
  const accentZones = (['roof', 'hood'] as Zone[]).filter((z) => zones.includes(z));
  const activeZone = accentZones.includes(zone) ? zone : accentZones[0];
  const is3d = has3d(cfg.model);

  return (
    <div className={`studio env-${cfg.env}`} style={{ '--bg-a': env.bg[0], '--bg-b': env.bg[1] } as React.CSSProperties}>
      <div className="stage">
        <canvas ref={canvasRef} className={ready ? 'on' : ''} aria-label={`3D preview of ${vehicleLabel(cfg)}`} />
        {(!ready || status.loading) && !status.missing && (
          <div className="stage-loading">
            {filmErr || status.error ? (
              <p>Couldn't load this car. Check your connection and try again.</p>
            ) : (
              <div className="loader">
                <div className="loader-bar">
                  <i style={{ transform: `scaleX(${Math.max(0.04, status.progress)})` }} />
                </div>
                <span className="mono">Loading {modelName(model)} · {Math.round(status.progress * 100)}%</span>
              </div>
            )}
          </div>
        )}
        {status.missing && (
          <div className="stage-soon">
            <span className="mono">3D model coming soon</span>
            <strong className="display">{modelName(model)}</strong>
            <p>We wrap this car every week. Its 3D model is still being prepared — pick your film and options and we'll quote it the same way.</p>
            <button className="btn accent" disabled={!body} onClick={() => setQuote(true)}>
              Request a quote <span className="arrow">→</span>
            </button>
          </div>
        )}
        <div className="stage-top">
          <Logo light={env.ink === 'light'} />
          <div className="stage-tools">
            <Seg label="Lighting" value={cfg.env} options={(Object.keys(ENVS) as EnvName[]).map((k) => ({ id: k, label: ENVS[k].label }))} onChange={(v) => update({ env: v })} />
          </div>
        </div>
        <div className="stage-spec">
          <span className="mono">{CLASSES[model.shape as keyof typeof CLASSES]?.label} · {model.gen}</span>
          <strong className="display">{modelName(model)}</strong>
          {body && (
            <span className="stage-film">
              <Swatch film={body} size={14} /> {body.brand} {body.name} · {FINISHES.find((f) => f.id === body.finish)?.label}
            </span>
          )}
        </div>
        {is3d && <div className="stage-bottom">
          <div className="views" role="toolbar" aria-label="Camera">
            {(['hero', 'front', 'side', 'rear', 'top'] as ViewName[]).map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => {
                  setView(v);
                  sceneRef.current?.setView(v);
                }}
              >
                {v === 'hero' ? '¾' : v}
              </button>
            ))}
            <button
              aria-pressed={rotate}
              onClick={() => {
                setRotate((r) => !r);
                sceneRef.current?.setAutoRotate(!rotate);
              }}
              title="Turntable"
            >
              ⟳
            </button>
          </div>
          <div className="views">
            <button onClick={surprise} title="Surprise me">
              ⚄ Surprise me
            </button>
            <button onClick={share}>Share</button>
            <button onClick={download} className="hide-xs">
              Save image
            </button>
          </div>
        </div>}
      </div>

      <aside className="panel">
        <div className="panel-scroll">
          <div className="panel-intro">
            <Link to="/" className="mono mute back">
              ← Legacy Wraps
            </Link>
            <h1 className="display">Studio</h1>
            <p className="mute">Drag to orbit. Every change updates the price.</p>
          </div>

          <Section n="01" title="Your car" aside={<span className="mono mute">{model.dims[0].toFixed(2)} m</span>}>
            <div className="tabs" role="tablist">
              {MAKE_GROUPS.map((g) => (
                <button key={g.id} role="tab" aria-selected={make === g.id} onClick={() => setMake(g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
            <div className="models">
              {[...modelsInMake].sort((a, b) => Number(has3d(b.id)) - Number(has3d(a.id))).map((m) => (
                <button key={m.id} className={`model ${cfg.model === m.id ? 'on' : ''}`} onClick={() => update({ model: m.id })} aria-pressed={cfg.model === m.id}>
                  <strong>
                    {m.model} <i className={`tag ${has3d(m.id) ? 'live' : ''}`}>{has3d(m.id) ? '3D' : 'Soon'}</i>
                  </strong>
                  <span className="mono mute">
                    {m.make.replace('Mercedes-', '')} · {m.gen}
                  </span>
                </button>
              ))}
            </div>
            <label className="field inline">
              <span>Year</span>
              <input className="input sm" inputMode="numeric" placeholder="e.g. 2019" value={cfg.year} maxLength={4} onChange={(e) => update({ year: e.target.value.replace(/\D/g, '') })} />
            </label>
          </Section>

          <Section n="02" title="Body film" aside={body && <span className="mono mute">{body.price.toLocaleString('en-KE')}/sq ft</span>}>
            <div className="filters">
              <button className="chip" aria-pressed={finish === 'all'} onClick={() => setFinish('all')}>
                All
              </button>
              {FINISHES.map((f) => (
                <button key={f.id} className="chip" aria-pressed={finish === f.id} onClick={() => setFinish(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <FilmPicker films={shown} value={cfg.zones.body} onPick={(id) => id && setZoneFilm('body', id)} size={44} />
            {body && (
              <div className="picked">
                <Swatch film={body} size={36} />
                <div>
                  <strong>{body.name}</strong>
                  <span className="mono mute">
                    {body.brand} · {FINISHES.find((f) => f.id === body.finish)?.label}
                  </span>
                </div>
              </div>
            )}
          </Section>

          {accentZones.length > 0 && activeZone && (
            <Section n="03" title="Contrast panels">
              <div className="tabs" role="tablist">
                {accentZones.map((z) => (
                  <button key={z} role="tab" aria-selected={activeZone === z} onClick={() => setZone(z)}>
                    {z === 'hood' ? 'Bonnet' : 'Roof'}
                    {cfg.zones[z] && <i className="tab-dot" />}
                  </button>
                ))}
              </div>
              <FilmPicker films={films.filter((f) => f.in_stock)} value={cfg.zones[activeZone]} onPick={(id) => setZoneFilm(activeZone, id)} size={32} allowNone />
            </Section>
          )}

          <Section n={accentZones.length ? '04' : '03'} title="Wheels & calipers">
            <div className="opt-row">
              {WHEELS.map((w) => (
                <button key={w.id} className={`opt ${cfg.wheels === w.id ? 'on' : ''}`} onClick={() => update({ wheels: w.id })} aria-pressed={cfg.wheels === w.id}>
                  <Swatch hex={w.hex} finish={w.finish} size={30} />
                  <span>{w.label}</span>
                </button>
              ))}
            </div>
            <div className="opt-row">
              {!zones.includes('rims') && is3d && <p className="hint full-row">Rim colour isn't previewed on this model yet. It's still included in your quote.</p>}
              {CALIPERS.map((c) => (
                <button key={c.id} className={`opt ${cfg.calipers === c.id ? 'on' : ''}`} onClick={() => update({ calipers: c.id })} aria-pressed={cfg.calipers === c.id}>
                  <Swatch hex={c.hex} finish="gloss" size={22} />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
            <p className="hint">Caliper colour is included in your quote.</p>
          </Section>

          <Section n={accentZones.length ? '05' : '04'} title="Window tint" aside={<span className="mono">{TINT[cfg.tint].vlt}</span>}>
            <input
              type="range"
              className="range"
              min={0}
              max={4}
              step={1}
              value={cfg.tint}
              onChange={(e) => update({ tint: Number(e.target.value) })}
              aria-label="Tint level"
              style={{ '--p': `${cfg.tint * 25}%` } as React.CSSProperties}
            />
            <div className="range-labels mono mute">
              {TINT.map((t) => (
                <span key={t.id}>{t.label}</span>
              ))}
            </div>
            <p className="hint">We'll advise which shades keep your front glass road-legal.</p>
          </Section>

          <Section n={accentZones.length ? '06' : '05'} title="Protection & finish">
            <div className="field">
              <span>Paint protection film</span>
              <Seg
                label="PPF coverage"
                value={cfg.ppf}
                options={[
                  { id: 'none', label: 'None' },
                  { id: 'front', label: 'Full front' },
                  { id: 'full', label: 'Full body' },
                ]}
                onChange={(v) => update({ ppf: v })}
              />
            </div>
            {cfg.ppf !== 'none' && (
              <Seg
                label="PPF finish"
                value={cfg.ppfFinish}
                options={[
                  { id: 'gloss', label: 'Gloss' },
                  { id: 'stealth', label: 'Stealth matte' },
                ]}
                onChange={(v) => update({ ppfFinish: v })}
              />
            )}
            <label className="toggle">
              <input type="checkbox" checked={cfg.chromeDelete} onChange={(e) => update({ chromeDelete: e.target.checked })} />
              <span>Chrome delete</span>
              <span className="mono mute">{money(CLASSES[model.shape as keyof typeof CLASSES].chromeDelete)}</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={cfg.ceramic} onChange={(e) => update({ ceramic: e.target.checked })} />
              <span>Ceramic coating</span>
              <span className="mono mute">{money(CLASSES[model.shape as keyof typeof CLASSES].ceramic)}</span>
            </label>
          </Section>

        </div>

        <div className="pricebar">
          {breakdown && (
            <ul className="lines">
              {est.lines.map((l) => (
                <li key={l.key}>
                  <span>{l.label}</span>
                  <span>{money(l.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="price-row">
            <button className="price" onClick={() => setBreakdown((b) => !b)} aria-expanded={breakdown}>
              <span className="mono mute">Estimate {breakdown ? '▾' : '▴'}</span>
              <strong>{money(est.total)}</strong>
            </button>
            <button className="btn accent" disabled={!ready || !body} onClick={() => setQuote(true)}>
              Request build <span className="arrow">→</span>
            </button>
          </div>
        </div>
      </aside>

      {quote && <QuoteModal cfg={cfg} total={est.total} onClose={() => setQuote(false)} snap={() => (is3d && sceneRef.current ? sceneRef.current.snapshot(1280, 720, 'image/webp') : null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
