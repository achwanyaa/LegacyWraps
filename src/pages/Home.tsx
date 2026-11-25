import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Nav, Footer } from '../components/SiteChrome';
import { Swatch } from '../components/Swatch';
import { useApi, useFilms, useSettings, whatsappLink, encodeBuild } from '../lib/api';
import { HEROES } from '../../shared/heroes.js';
import { CLASSES, FINISHES, TINT, estimate, normalizeConfig, moneyShort, modelById, modelName } from '../../shared/catalog.js';
import type { BuildConfig, Film } from '../lib/types';
import '../styles/home.css';

const SLIDE_MS = 5200;

function Hero() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0, 1]));
  const { data: s } = useSettings();
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setI((n) => (n + 1) % HEROES.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, paused]);
  useEffect(() => {
    setSeen((prev) => (prev.has((i + 1) % HEROES.length) ? prev : new Set([...prev, (i + 1) % HEROES.length])));
  }, [i]);
  const h = HEROES[i];
  const studioHref = `/studio?b=${encodeBuild(normalizeConfig(h.config))}`;
  return (
    <section className="hero" style={{ '--hero-c': h.hex } as React.CSSProperties} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="hero-glow" aria-hidden />
      <div className="hero-word display" aria-hidden key={h.id}>
        {h.short}
      </div>
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="mono hero-kicker">
            <span className="dot live" /> Nairobi · Colour change · PPF · Tint
          </p>
          <h1 className="display hero-title">
            Wear
            <br />
            something
            <br />
            <span className="hero-title-accent">different.</span>
          </h1>
          <p className="hero-lede">
            Premium wraps for Kenya's best cars. Pick your car and film in our 3D studio, see the price in shillings, then book your bay.
          </p>
          <div className="hero-cta">
            <Link className="btn accent" to={studioHref}>
              Design yours in 3D <span className="arrow">→</span>
            </Link>
            <a className="btn ghost" href={whatsappLink(s?.phone, 'Hi Legacy Wraps, I would like a wrap quote.')} target="_blank" rel="noreferrer">
              Chat on WhatsApp
            </a>
          </div>
        </div>
        <div className="hero-stage">
          {HEROES.map((x, n) =>
            seen.has(n) ? (
              <picture key={x.id} className={`hero-car ${n === i ? 'on' : ''}`}>
                <source media="(max-width: 760px)" srcSet={`/renders/${x.id}-sm.webp`} />
                <img src={`/renders/${x.id}.webp`} alt={`${x.name} wrapped in ${x.film}`} width={1600} height={900} fetchPriority={n === 0 ? 'high' : 'low'} decoding="async" />
              </picture>
            ) : null,
          )}
        </div>
        <div className="hero-caption">
          <div className="hero-now" key={h.id}>
            <span className="mono mute">Now showing</span>
            <strong>{h.name}</strong>
            <span className="hero-film">
              <span className="hero-film-dot" />
              {h.film}
            </span>
          </div>
          <div className="hero-dots" role="tablist" aria-label="Featured builds">
            {HEROES.map((x, n) => (
              <button key={x.id} role="tab" aria-selected={n === i} aria-label={x.name} className={n === i ? 'on' : ''} onClick={() => setI(n)}>
                <span style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }} />
              </button>
            ))}
          </div>
          <Link className="hero-open" to={studioHref}>
            Open this build ↗
          </Link>
        </div>
      </div>
    </section>
  );
}

function Ticker() {
  const items = ['3M', 'Avery Dennison', 'KPMF', 'Inozetek', 'TeckWrap', 'Self-healing PPF', 'Nano-ceramic tint', 'Up to 7-year film warranty', 'M-Pesa deposits', 'Mombasa Road, Nairobi'];
  const row = items.map((t) => (
    <span key={t}>
      {t} <i>✦</i>
    </span>
  ));
  return (
    <div className="ticker" aria-hidden>
      <div className="ticker-track">
        {row}
        {row}
      </div>
    </div>
  );
}

function FilmLibrary() {
  const { data: films } = useFilms();
  const [finish, setFinish] = useState('all');
  const [all, setAll] = useState(false);
  const nav = useNavigate();
  const priced = useMemo(() => {
    if (!films) return [];
    const byId = Object.fromEntries(films.map((f) => [f.id, f]));
    return films.map((f) => {
      const cfg = normalizeConfig({ model: 'mercedes-c200', zones: { body: f.id }, wheels: 'stock', calipers: 'stock', tint: 0, chromeDelete: false });
      return { film: f, from: estimate(cfg, byId).total };
    });
  }, [films]);
  const list = priced.filter((p) => finish === 'all' || p.film.finish === finish);
  const shown = all ? list : list.slice(0, 12);
  return (
    <section className="section" id="films">
      <div className="wrap">
        <div className="section-head">
          <p className="mono mute">01 — The film library</p>
          <h2 className="display h2">Pick a film,<br />not a guess.</h2>
          <p className="section-lede">Every film we stock, in every finish. Tap one to see it on your car in the studio. Prices are a full colour change on a C&nbsp;200.</p>
        </div>
        <div className="filters" role="toolbar" aria-label="Filter by finish">
          <button className="chip" aria-pressed={finish === 'all'} onClick={() => setFinish('all')}>
            All
          </button>
          {FINISHES.map((f) => (
            <button key={f.id} className="chip" aria-pressed={finish === f.id} onClick={() => setFinish(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="film-grid">
          {!films &&
            Array.from({ length: 8 }).map((_, n) => <div key={n} className="film-card skeleton" />)}
          {shown.map(({ film, from }) => (
            <button key={film.id} className="film-card" disabled={!film.in_stock} onClick={() => nav(`/studio?film=${film.id}`)}>
              <Swatch film={film} size={64} />
              <span className="film-meta">
                <span className="mono mute">{film.brand}</span>
                <strong>{film.name}</strong>
                <span className="film-row">
                  <span className="badge">{FINISHES.find((x) => x.id === film.finish)?.label}</span>
                  <span className="film-from">{film.in_stock ? `from ${moneyShort(from)}` : 'Back soon'}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
        {list.length > 12 && (
          <button className="btn ghost sm show-all" onClick={() => setAll((a) => !a)}>
            {all ? 'Show fewer' : `Show all ${list.length} films`}
          </button>
        )}
      </div>
    </section>
  );
}

function Services() {
  const c = CLASSES.sedan;
  const s = CLASSES.suv;
  const items = [
    { n: '01', t: 'Colour change', d: 'Full-body cast vinyl in gloss, satin, matte, metallic, colour-shift or chrome. Door shuts on request.', p: `from ${moneyShort(c.labour + c.sqft * 230)}` },
    { n: '02', t: 'Paint protection film', d: 'Self-healing PPF against murram chips and bush scratches. Gloss or stealth matte.', p: `front from ${moneyShort(c.ppfFront)}` },
    { n: '03', t: 'Nano-ceramic tint', d: 'Cuts heat without killing visibility. We keep you road-legal.', p: `from ${moneyShort(TINT[1].price)}` },
    { n: '04', t: 'Chrome delete & de-badge', d: 'Window trim, grilles and badges in gloss or satin black.', p: `from ${moneyShort(c.chromeDelete)}` },
    { n: '05', t: 'Ceramic coating', d: 'Hydrophobic top coat over paint or film. Dust and Nairobi rain slide off.', p: `from ${moneyShort(c.ceramic)}` },
    { n: '06', t: 'Corporate & fleet', d: 'Branded fleets, launch cars and showroom vehicles. Printed or colour-matched film.', p: 'quoted per fleet' },
  ];
  return (
    <section className="section dark" id="services">
      <div className="wrap">
        <div className="section-head">
          <p className="mono mute">02 — Services</p>
          <h2 className="display h2">Everything the<br />paint shop won't do.</h2>
          <p className="section-lede">Reversible, protective, and done in days, not weeks. SUVs from {moneyShort(s.labour + s.sqft * 230)} for a full colour change.</p>
        </div>
        <div className="svc-grid">
          {items.map((i) => (
            <article key={i.n} className="svc">
              <span className="mono mute">{i.n}</span>
              <h3>{i.t}</h3>
              <p>{i.d}</p>
              <span className="svc-price mono">{i.p}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Process() {
  const steps = [
    ['Design', 'Build it in the 3D studio. Save it, share it, argue about it.'],
    ['Consult', 'We confirm film, panels and price. Deposit by M-Pesa books your bay.'],
    ['Prep', 'Decon wash, clay, panel wipe. Handles, lights and badges come off.'],
    ['Wrap', 'Hand-laid film, tucked edges, relief cuts kept off your paint.'],
    ['Cure', 'Every edge post-heated, then 24 hours indoors to settle.'],
    ['Deliver', 'Final QC under lights, aftercare briefing, and you drive out.'],
  ];
  return (
    <section className="section" id="process">
      <div className="wrap">
        <div className="section-head">
          <p className="mono mute">03 — How it works</p>
          <h2 className="display h2">Two to four days.<br />Six steps.</h2>
        </div>
        <ol className="process">
          {steps.map(([t, d], n) => (
            <li key={t}>
              <span className="process-n display">{String(n + 1).padStart(2, '0')}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

interface GalleryItem {
  id: number;
  vehicle: string;
  owner: string;
  config: BuildConfig;
  snapshot_url: string | null;
}

function Work() {
  const { data } = useApi<GalleryItem[]>('/gallery', { cached: true });
  const { data: films } = useFilms();
  const byId = useMemo(() => Object.fromEntries((films || []).map((f) => [f.id, f])), [films]) as Record<string, Film>;
  if (data && !data.length) return null;
  return (
    <section className="section" id="work">
      <div className="wrap">
        <div className="section-head row">
          <div>
            <p className="mono mute">04 — Recent work</p>
            <h2 className="display h2">Fresh out<br />of the bay.</h2>
          </div>
          <Link className="btn ghost sm" to="/studio">
            Start yours →
          </Link>
        </div>
        <div className="work-grid">
          {(data || Array.from({ length: 6 }, () => null)).map((g, n) =>
            g ? (
              <Link key={g.id} to={`/studio?b=${encodeBuild(g.config)}`} className="work-card">
                <div className="work-img">{g.snapshot_url && <img src={g.snapshot_url} alt={`${g.vehicle} wrap`} loading="lazy" width={960} height={600} />}</div>
                <div className="work-meta">
                  <strong>{g.vehicle || modelName(modelById(g.config.model))}</strong>
                  <span className="work-film">
                    <Swatch film={byId[g.config.zones.body]} size={16} />
                    {byId[g.config.zones.body]?.name || '—'}
                  </span>
                  <span className="mono mute">{g.owner}'s build</span>
                </div>
              </Link>
            ) : (
              <div key={n} className="work-card skeleton" />
            ),
          )}
        </div>
      </div>
    </section>
  );
}

function TrackBand() {
  const [code, setCode] = useState('');
  const nav = useNavigate();
  return (
    <section className="section track-band">
      <div className="wrap track-inner">
        <div>
          <p className="mono">Already booked?</p>
          <h2 className="display h2">Watch your<br />car change.</h2>
          <p>Every build gets a code. Follow it from the bay to delivery, with live updates from the team.</p>
        </div>
        <form
          className="track-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) nav(`/track/${code.trim().toUpperCase()}`);
          }}
        >
          <label className="sr-only" htmlFor="code">
            Build code
          </label>
          <input id="code" className="input" placeholder="LW-XXXXX" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
          <button className="btn">Track →</button>
        </form>
      </div>
    </section>
  );
}

function Faq() {
  const qs = [
    ['How long does a wrap last in the Nairobi sun?', 'Premium cast films last 5 to 7 years on vertical panels with normal care. Roofs and bonnets take the most UV, so we recommend shade parking and a ceramic top coat.'],
    ['Will a wrap damage my paint?', 'Not on factory paint in good condition. Film comes off clean within its rated life, and it protects the paint underneath from chips and fading.'],
    ['How do I pay?', 'A 50% deposit by M-Pesa or bank transfer reserves your bay and orders your film. The balance is due when you collect.'],
    ['Do I need to update my logbook after a colour change?', 'A full colour change can differ from what is on your logbook. We will tell you what to update with NTSA before you drive out.'],
    ['How dark can my tint go?', 'We will recommend shades that keep you road-legal and talk you through the trade-offs. Darker films are available for rear glass.'],
    ['How long will you have my car?', 'Two to four days for a colour change, one day for tint, two to three days for PPF. Booking is in the studio or on WhatsApp.'],
  ];
  return (
    <section className="section" id="faq">
      <div className="wrap faq-grid">
        <div className="section-head">
          <p className="mono mute">05 — Questions</p>
          <h2 className="display h2">Good<br />questions.</h2>
        </div>
        <div className="faq">
          {qs.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span aria-hidden>+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Home() {
  useEffect(() => {
    document.title = 'Legacy Wraps — Premium car wraps, PPF & tint in Nairobi';
  }, []);
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Ticker />
        <FilmLibrary />
        <Services />
        <Process />
        <Work />
        <TrackBand />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
