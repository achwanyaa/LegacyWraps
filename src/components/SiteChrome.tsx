import '../styles/site.css';
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { useSettings, whatsappLink } from '../lib/api';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className={`logo ${light ? 'light' : ''}`} aria-label="Legacy Wraps home">
      <span className="logo-mark" aria-hidden>
        <svg viewBox="0 0 64 64" width="28" height="28">
          <rect width="64" height="64" rx="14" fill="currentColor" />
          <path d="M14 46V18h7v22h13v6z" fill="var(--logo-bg, #ecebe6)" />
          <path d="M36 18h7l3 17 4-17h5l-7 28h-6z" fill="#ff5a1f" />
        </svg>
      </span>
      <span className="logo-word">
        LEGACY<b>WRAPS</b>
      </span>
    </Link>
  );
}

export function Nav() {
  const { data: s } = useSettings();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={`nav ${scrolled ? 'scrolled' : ''} ${open ? 'open' : ''}`}>
      <div className="wrap nav-row">
        <Logo />
        <nav className="nav-links" onClick={() => setOpen(false)}>
          <NavLink to="/studio">Studio</NavLink>
          <a href="/#films">Films</a>
          <a href="/#services">Services</a>
          <a href="/#work">Work</a>
          <NavLink to="/track">Track a build</NavLink>
        </nav>
        <div className="nav-cta">
          <a className="btn sm ghost hide-sm" href={whatsappLink(s?.phone, 'Hi Legacy Wraps, I would like to book a wrap.')} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
          <Link className="btn sm" to="/studio">
            Design yours
          </Link>
          <button className="nav-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const { data: s } = useSettings();
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-big display">Wear something different.</div>
        <div className="footer-grid">
          <div>
            <Logo light />
            <p className="mute">{s?.tagline}</p>
          </div>
          <div>
            <div className="mono mute">Visit</div>
            <p>
              {s?.address}
              <br />
              {s?.city}
            </p>
            <p className="mute">{s?.hours}</p>
          </div>
          <div>
            <div className="mono mute">Talk</div>
            <p>
              <a href={`tel:${(s?.phone || '').replace(/\s/g, '')}`}>{s?.phone}</a>
              <br />
              <a href={whatsappLink(s?.phone)} target="_blank" rel="noreferrer">
                WhatsApp us
              </a>
              <br />
              <a href={`mailto:${s?.email}`}>{s?.email}</a>
            </p>
          </div>
          <div>
            <div className="mono mute">Explore</div>
            <p>
              <Link to="/studio">3D Studio</Link>
              <br />
              <Link to="/track">Track a build</Link>
              <br />
              <span className="mute">{s?.instagram}</span>
            </p>
          </div>
        </div>
        <div className="footer-base mono">
          <span>© {new Date().getFullYear()} {s?.shopName || 'Legacy Wraps'} · Nairobi</span>
          <Link to="/admin">Staff</Link>
        </div>
      </div>
    </footer>
  );
}
