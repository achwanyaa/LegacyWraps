import express from 'express';
import crypto from 'node:crypto';
import {
  sb,
  must,
  newCode,
  nowIso,
  getSetting,
  setSettings,
  publicSettings,
  PUBLIC_SETTING_KEYS,
  filmsById,
  filmRow,
  addEvent,
  verifyPassword,
  hashPassword,
  saveSnapshot,
  snapshotUrl,
  audit,
  rateLimited,
  clearRate,
  normLogin,
} from './db.js';
import { estimate, normalizeConfig, vehicleLabel, STATUSES, FINISHES } from '../shared/catalog.js';

export const api = express.Router();
const STATUS_IDS = STATUSES.map((s) => s.id);
const JOB_DAYS = 3; // a wrap occupies a bay ~3 days (install + post-heat + cure)

// Express 5 forwards rejected promises to the error handler, so handlers can be plain async functions.

// ---------- auth (stateless signed cookie; works across serverless instances) ----------
const COOKIE = 'lw_admin';
async function sign(payload) {
  return crypto.createHmac('sha256', await getSetting('sessionSecret')).update(payload).digest('base64url');
}
async function issueToken(staff) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 12, sid: staff.id })).toString('base64url');
  return `${payload}.${await sign(payload)}`;
}
function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
// Staff rows are cached briefly so a deactivated account loses access within a minute.
const staffCache = new Map();
async function staffById(id) {
  const hit = staffCache.get(id);
  if (hit && Date.now() - hit.at < 60_000) return hit.row;
  const row = must(await sb.from('staff').select('id, name, login, role, active').eq('id', id).maybeSingle());
  staffCache.set(id, { at: Date.now(), row });
  return row;
}
/** The signed-in staff member, or null. */
async function sessionStaff(req) {
  const [payload, sig] = (readCookie(req, COOKIE) || '').split('.');
  if (!payload || !sig) return null;
  const expected = await sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let tok;
  try {
    tok = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
  if (!(tok.exp > Date.now()) || !tok.sid) return null;
  const staff = await staffById(tok.sid);
  return staff?.active ? staff : null;
}
const clientIp = (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'x';
const staffOut = (r) => ({ id: r.id, name: r.name, login: r.login, role: r.role, active: r.active });
const requireOwner = (req, res, next) => (req.staff?.role === 'owner' ? next() : res.status(403).json({ error: 'Only the owner can do that.' }));

// ---------- serializers ----------
const firstName = (n) => String(n || '').split(' ')[0];
const jobOut = (r) => {
  const { snapshot_path, ...rest } = r;
  return { ...rest, snapshot_url: snapshotUrl(snapshot_path) };
};

// ---------- availability ----------
async function occupancy(fromIso, days) {
  const [baysSetting, rowsRes] = await Promise.all([
    getSetting('bays', 4),
    sb.from('jobs').select('scheduled_date').not('scheduled_date', 'is', null).in('status', ['booked', 'in_bay', 'curing', 'ready']),
  ]);
  const bays = Number(baysSetting) || 4;
  const rows = must(rowsRes);
  const start = new Date(fromIso + 'T00:00:00Z');
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const used = rows.filter((r) => {
      const diff = Math.round((d - new Date(r.scheduled_date + 'T00:00:00Z')) / 86400000);
      return diff >= 0 && diff < JOB_DAYS;
    }).length;
    const closed = d.getUTCDay() === 0;
    out.push({ date: iso, free: closed ? 0 : Math.max(0, bays - used), used, bays, closed });
  }
  return out;
}
const todayIso = () => new Date().toISOString().slice(0, 10);

// ---------- public ----------
api.get('/settings', async (_req, res) => res.json(await publicSettings()));

api.get('/films', async (_req, res) => {
  res.json(must(await sb.from('films').select('*').order('sort').order('name')).map(filmRow));
});

api.get('/gallery', async (_req, res) => {
  const rows = must(
    await sb
      .from('jobs')
      .select('id, vehicle, customer_name, config, snapshot_path, updated_at')
      .eq('featured', true)
      .order('updated_at', { ascending: false })
      .limit(12),
  );
  res.json(rows.map((r) => ({ id: r.id, vehicle: r.vehicle, owner: firstName(r.customer_name), config: r.config, snapshot_url: snapshotUrl(r.snapshot_path) })));
});

api.get('/availability', async (_req, res) => {
  const from = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10); // lead time to order film
  res.json(await occupancy(from, 42));
});

api.post('/quote', async (req, res) => {
  if (await rateLimited(`quote:${clientIp(req)}`, 8, 60 * 60 * 1000)) return res.status(429).json({ error: 'Too many requests from this connection. Please message us on WhatsApp instead.' });
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  const email = String(b.email || '').trim().slice(0, 120);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Name and a valid email are required.' });
  const config = normalizeConfig(b.config);
  const films = await filmsById();
  if (!films[config.zones.body]) return res.status(400).json({ error: 'Pick a body film first.' });
  const est = estimate(config, films, { labourMultiplier: await getSetting('labourMultiplier', 1) }).total;
  const code = await newCode();
  const snapshot_path = typeof b.snapshot === 'string' ? await saveSnapshot(code, b.snapshot) : null;
  const job = must(
    await sb
      .from('jobs')
      .insert({
        code,
        customer_name: name,
        email,
        phone: String(b.phone || '').slice(0, 40) || null,
        vehicle: vehicleLabel(config),
        message: String(b.message || '').slice(0, 1000) || null,
        preferred_date: /^\d{4}-\d{2}-\d{2}$/.test(b.preferred_date || '') ? b.preferred_date : null,
        config,
        estimate: est,
        snapshot_path,
      })
      .select('id')
      .single(),
  );
  await addEvent(job.id, 'inquiry', 'Build request received from the Studio.');
  res.status(201).json({ code, estimate: est });
});

api.get('/track/:code', async (req, res) => {
  let code = String(req.params.code || '').toUpperCase().trim();
  if (!code.startsWith('LW-')) code = `LW-${code}`;
  const r = must(await sb.from('jobs').select('*').eq('code', code).maybeSingle());
  if (!r) return res.status(404).json({ error: 'No build with that code.' });
  const events = must(
    await sb.from('job_events').select('status, message, created_at').eq('job_id', r.id).eq('public', true).order('created_at').order('id'),
  );
  res.json({
    code: r.code,
    status: r.status,
    owner: firstName(r.customer_name),
    vehicle: r.vehicle,
    config: r.config,
    estimate: r.estimate,
    final_price: r.final_price,
    scheduled_date: r.scheduled_date,
    snapshot_url: snapshotUrl(r.snapshot_path),
    created_at: r.created_at,
    events,
  });
});

// ---------- admin ----------
api.post('/admin/login', async (req, res) => {
  const key = `login:${clientIp(req)}`;
  if (await rateLimited(key, 10, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const login = normLogin(req.body?.login) || 'owner'; // a blank username means the owner account
  const staff = must(await sb.from('staff').select('*').eq('login', login).maybeSingle());
  if (!staff?.active || !verifyPassword(String(req.body?.password || ''), staff.password_hash))
    return res.status(401).json({ error: 'Wrong username or password.' });
  await clearRate(key);
  staffCache.delete(staff.id);
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.secure ? '; Secure' : '';
  res.set('Set-Cookie', `${COOKIE}=${await issueToken(staff)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`);
  await audit(staff.id, 'login', 'staff', staff.id);
  res.json({ ok: true, staff: staffOut(staff) });
});
api.post('/admin/logout', (_req, res) => {
  res.set('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});
api.get('/admin/me', async (req, res) => {
  const staff = await sessionStaff(req);
  res.json({ authed: !!staff, staff: staff ? staffOut(staff) : null });
});

api.use('/admin', async (req, res, next) => {
  req.staff = await sessionStaff(req);
  return req.staff ? next() : res.status(401).json({ error: 'Not signed in' });
});

api.get('/admin/jobs', async (_req, res) => {
  res.json(must(await sb.from('jobs').select('*').order('updated_at', { ascending: false })).map(jobOut));
});

api.get('/admin/jobs/:id', async (req, res) => {
  const r = must(await sb.from('jobs').select('*').eq('id', Number(req.params.id)).maybeSingle());
  if (!r) return res.status(404).json({ error: 'Not found' });
  const events = must(await sb.from('job_events').select('*').eq('job_id', r.id).order('created_at', { ascending: false }).order('id', { ascending: false }));
  res.json({ ...jobOut(r), events });
});

api.patch('/admin/jobs/:id', async (req, res) => {
  const id = Number(req.params.id);
  const cur = must(await sb.from('jobs').select('*').eq('id', id).maybeSingle());
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const next = {};
  if (b.status !== undefined) {
    if (!STATUS_IDS.includes(b.status)) return res.status(400).json({ error: 'Bad status' });
    next.status = b.status;
  }
  for (const k of ['customer_name', 'email', 'phone', 'vehicle', 'notes']) if (b[k] !== undefined) next[k] = String(b[k] ?? '').slice(0, 2000);
  if (b.final_price !== undefined) next.final_price = b.final_price === null || b.final_price === '' ? null : Math.round(Number(b.final_price)) || 0;
  if (b.scheduled_date !== undefined) next.scheduled_date = /^\d{4}-\d{2}-\d{2}$/.test(b.scheduled_date || '') ? b.scheduled_date : null;
  if (b.bay !== undefined) next.bay = b.bay === null || b.bay === '' ? null : Number(b.bay);
  if (b.featured !== undefined) next.featured = !!b.featured;
  if (b.lost_reason !== undefined) next.lost_reason = String(b.lost_reason ?? '').trim().slice(0, 300) || null;
  if (Object.keys(next).length) {
    next.updated_at = nowIso();
    must(await sb.from('jobs').update(next).eq('id', id));
  }
  if (next.status && next.status !== cur.status) {
    const s = STATUSES.find((x) => x.id === next.status);
    await addEvent(id, next.status, String(b.event_message || '').trim() || s.blurb, true, nowIso(), req.staff.id);
  }
  if (next.scheduled_date && next.scheduled_date !== cur.scheduled_date) {
    const d = new Date(next.scheduled_date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    await addEvent(id, null, `Install scheduled for ${d}.`, true, nowIso(), req.staff.id);
  }
  const changed = Object.keys(next).filter((k) => k !== 'updated_at' && next[k] !== cur[k]);
  if (changed.length) await audit(req.staff.id, 'update', 'job', id, Object.fromEntries(changed.map((k) => [k, cur[k]])), Object.fromEntries(changed.map((k) => [k, next[k]])));
  res.json(jobOut(must(await sb.from('jobs').select('*').eq('id', id).single())));
});

api.post('/admin/jobs/:id/events', async (req, res) => {
  const id = Number(req.params.id);
  const message = String(req.body?.message || '').trim().slice(0, 600);
  if (!message) return res.status(400).json({ error: 'Message required' });
  await addEvent(id, null, message, req.body?.public !== false, nowIso(), req.staff.id);
  must(await sb.from('jobs').update({ updated_at: nowIso() }).eq('id', id));
  res.status(201).json({ ok: true });
});

api.delete('/admin/jobs/:id', requireOwner, async (req, res) => {
  const r = must(await sb.from('jobs').select('*').eq('id', Number(req.params.id)).maybeSingle());
  if (r) await audit(req.staff.id, 'delete', 'job', r.id, r, null);
  if (r?.snapshot_path) await sb.storage.from('snapshots').remove([r.snapshot_path]);
  must(await sb.from('jobs').delete().eq('id', Number(req.params.id)));
  res.json({ ok: true });
});

api.get('/admin/schedule', async (req, res) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : todayIso();
  res.json({ days: await occupancy(from, 14), jobDays: JOB_DAYS });
});

const FINISH_IDS = FINISHES.map((f) => f.id);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
function readFilm(b) {
  const finish = FINISH_IDS.includes(b.finish) ? b.finish : 'gloss';
  const hex2 = /^#[0-9a-f]{6}$/i.test(b.hex2 || '') ? b.hex2 : null;
  return {
    brand: String(b.brand || '').trim().slice(0, 40) || 'House',
    name: String(b.name || '').trim().slice(0, 60),
    finish,
    hex: /^#[0-9a-f]{6}$/i.test(b.hex || '') ? b.hex : '#888888',
    hex2: finish === 'shift' ? hex2 || '#ffffff' : null,
    price: Math.max(0, Number(b.price) || 0),
    in_stock: b.in_stock !== false,
    featured: !!b.featured,
  };
}

api.post('/admin/films', async (req, res) => {
  const f = readFilm(req.body || {});
  if (!f.name) return res.status(400).json({ error: 'Name required' });
  let id = slugify(`${f.brand} ${f.name}`) || 'film';
  while (must(await sb.from('films').select('id').eq('id', id).maybeSingle())) id += '-2';
  const last = must(await sb.from('films').select('sort').order('sort', { ascending: false }).limit(1));
  const row = must(await sb.from('films').insert({ id, ...f, sort: (last[0]?.sort ?? 0) + 1 }).select('*').single());
  await audit(req.staff.id, 'create', 'film', id, null, row);
  res.status(201).json(filmRow(row));
});

api.put('/admin/films/:id', async (req, res) => {
  const cur = must(await sb.from('films').select('*').eq('id', req.params.id).maybeSingle());
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const f = readFilm({ ...cur, ...req.body });
  if (!f.name) return res.status(400).json({ error: 'Name required' });
  const row = must(await sb.from('films').update(f).eq('id', cur.id).select('*').single());
  await audit(req.staff.id, 'update', 'film', cur.id, cur, row);
  res.json(filmRow(row));
});

api.delete('/admin/films/:id', requireOwner, async (req, res) => {
  const cur = must(await sb.from('films').select('*').eq('id', req.params.id).maybeSingle());
  must(await sb.from('films').delete().eq('id', req.params.id));
  if (cur) await audit(req.staff.id, 'delete', 'film', cur.id, cur, null);
  res.json({ ok: true });
});

api.get('/admin/settings', async (_req, res) => res.json(await publicSettings()));
api.put('/admin/settings', requireOwner, async (req, res) => {
  const b = req.body || {};
  const patch = {};
  for (const k of PUBLIC_SETTING_KEYS) {
    if (b[k] === undefined) continue;
    if (k === 'bays') patch[k] = Math.max(1, Math.min(20, Math.round(Number(b[k]) || 1)));
    else if (k === 'labourMultiplier') patch[k] = Math.max(0.5, Math.min(3, Number(b[k]) || 1));
    else patch[k] = String(b[k]).slice(0, 200);
  }
  const before = await publicSettings();
  await setSettings(patch);
  const after = await publicSettings();
  const keys = Object.keys(patch).filter((k) => before[k] !== after[k]);
  if (keys.length) await audit(req.staff.id, 'update', 'settings', null, Object.fromEntries(keys.map((k) => [k, before[k]])), Object.fromEntries(keys.map((k) => [k, after[k]])));
  res.json(after);
});
api.post('/admin/password', async (req, res) => {
  const { current, next } = req.body || {};
  const me = must(await sb.from('staff').select('password_hash').eq('id', req.staff.id).single());
  if (!verifyPassword(String(current || ''), me.password_hash)) return res.status(400).json({ error: 'Current password is wrong.' });
  if (String(next || '').length < 8) return res.status(400).json({ error: 'Use at least 8 characters.' });
  must(await sb.from('staff').update({ password_hash: hashPassword(String(next)) }).eq('id', req.staff.id));
  await audit(req.staff.id, 'update', 'staff', req.staff.id, null, { password: 'changed' });
  res.json({ ok: true });
});

// ---------- staff accounts (owner only) ----------
api.get('/admin/staff', requireOwner, async (_req, res) => {
  res.json(must(await sb.from('staff').select('*').order('created_at')).map(staffOut));
});
api.post('/admin/staff', requireOwner, async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 80);
  const login = normLogin(b.login);
  if (!name || !login) return res.status(400).json({ error: 'Name and username are required.' });
  if (String(b.password || '').length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
  if (must(await sb.from('staff').select('id').eq('login', login).maybeSingle())) return res.status(400).json({ error: 'That username is taken.' });
  const row = must(
    await sb.from('staff').insert({ name, login, password_hash: hashPassword(String(b.password)), role: b.role === 'owner' ? 'owner' : 'staff' }).select('*').single(),
  );
  await audit(req.staff.id, 'create', 'staff', row.id, null, staffOut(row));
  res.status(201).json(staffOut(row));
});
api.patch('/admin/staff/:id', requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  const cur = must(await sb.from('staff').select('*').eq('id', id).maybeSingle());
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const b = req.body || {};
  const next = {};
  if (b.name !== undefined) next.name = String(b.name).trim().slice(0, 80) || cur.name;
  if (b.role !== undefined) next.role = b.role === 'owner' ? 'owner' : 'staff';
  if (b.active !== undefined) next.active = !!b.active;
  if (b.password) {
    if (String(b.password).length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
    next.password_hash = hashPassword(String(b.password));
  }
  const losesOwner = cur.role === 'owner' && cur.active && (next.role === 'staff' || next.active === false);
  if (losesOwner) {
    const { count } = await sb.from('staff').select('id', { count: 'exact', head: true }).eq('role', 'owner').eq('active', true);
    if (count <= 1) return res.status(400).json({ error: 'Keep at least one active owner.' });
  }
  const row = must(await sb.from('staff').update(next).eq('id', id).select('*').single());
  staffCache.delete(id);
  const { password_hash: _a, ...after } = next;
  await audit(req.staff.id, 'update', 'staff', id, staffOut(cur), { ...after, ...(b.password ? { password: 'reset' } : {}) });
  res.json(staffOut(row));
});

api.get('/admin/stats', async (_req, res) => {
  // Independent queries in parallel: each Supabase round-trip is ~200ms from Nairobi.
  const [jobsRes, delivRes, films, activityRes, todayOcc] = await Promise.all([
    sb.from('jobs').select('id, status, estimate, final_price, config, created_at'),
    sb.from('job_events').select('job_id, created_at').eq('status', 'delivered'),
    filmsById(),
    sb
      .from('job_events')
      .select('id, status, message, created_at, job_id, jobs(customer_name, code, vehicle)')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(14),
    occupancy(todayIso(), 1),
  ]);
  const jobs = must(jobsRes);
  const delivEvents = must(delivRes);
  const value = (j) => j.final_price ?? j.estimate;
  const byId = Object.fromEntries(jobs.map((j) => [j.id, j]));
  const delivered = delivEvents
    .filter((e) => byId[e.job_id]?.status === 'delivered')
    .map((e) => ({ at: Date.parse(e.created_at), value: value(byId[e.job_id]) }));
  const now = Date.now();
  const day = 86400000;
  const open = jobs.filter((j) => j.status === 'inquiry' || j.status === 'quoted');
  const active = jobs.filter((j) => ['booked', 'in_bay', 'curing', 'ready'].includes(j.status));

  const weeks = [];
  for (let w = 9; w >= 0; w--) {
    const end = now - w * 7 * day;
    const start = end - 7 * day;
    weeks.push({
      start: new Date(start).toISOString(),
      requests: jobs.filter((j) => Date.parse(j.created_at) >= start && Date.parse(j.created_at) < end).length,
      revenue: delivered.filter((d) => d.at >= start && d.at < end).reduce((s, d) => s + d.value, 0),
    });
  }
  const counts = {};
  for (const j of jobs) {
    const id = j.config?.zones?.body;
    if (id) counts[id] = (counts[id] || 0) + 1;
  }
  const topFilms = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, n]) => ({ id, n, film: films[id] || null }));
  const activity = must(activityRes).map(({ jobs: j, ...e }) => ({ ...e, ...j }));

  res.json({
    open: open.length,
    openValue: open.reduce((s, j) => s + value(j), 0),
    active: active.length,
    activeValue: active.reduce((s, j) => s + value(j), 0),
    revenue30: delivered.filter((d) => now - d.at < 30 * day).reduce((s, d) => s + d.value, 0),
    avgTicket: delivered.length ? Math.round(delivered.reduce((s, d) => s + d.value, 0) / delivered.length) : 0,
    conversion: jobs.length ? jobs.filter((j) => !['inquiry', 'quoted'].includes(j.status)).length / jobs.length : 0,
    weeks,
    topFilms,
    activity,
    today: todayOcc[0],
  });
});

api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
api.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});
