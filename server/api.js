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
  adminSettings,
  ADMIN_SETTING_DEFAULTS,
  leadIntakeKey,
  upsertCustomer,
} from './db.js';
import { estimate, normalizeConfig, vehicleLabel, STATUSES, FINISHES, LEAD_SOURCES, SERVICES, normPhone, money } from '../shared/catalog.js';

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
// ---------- leads ----------
const SOURCE_IDS = LEAD_SOURCES.map((s) => s.id);
const SERVICE_IDS = SERVICES.map((s) => s.id);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Name plus a phone or an email. Returns {customer_name, phone, email} or {error}. */
function readContact(b, { phoneRequired = false } = {}) {
  const customer_name = String(b.name ?? b.customer_name ?? '').trim().slice(0, 80);
  const phone = normPhone(String(b.phone || '').slice(0, 40));
  const email = String(b.email || '').trim().slice(0, 120) || null;
  if (!customer_name) return { error: 'Name is required.' };
  if (email && !EMAIL_RE.test(email)) return { error: 'That email address does not look right.' };
  if (phone && phone.replace(/\D/g, '').length < 9) return { error: 'That phone number looks too short.' };
  if (phoneRequired && !phone) return { error: 'A phone number is required.' };
  if (!phone && !email) return { error: 'Add a phone number or an email so we can reply.' };
  return { customer_name, phone, email };
}
/** Source tag from the body or the link's utm values. */
function readSource(b, fallback) {
  const utm = String(b.utm_source || '').toLowerCase();
  const fromUtm = utm.includes('insta') || utm === 'ig' ? 'instagram' : utm.includes('whatsapp') || utm === 'wa' ? 'whatsapp' : null;
  const source = SOURCE_IDS.includes(b.source) ? b.source : fromUtm || fallback;
  const detail = [b.source_detail, b.utm_campaign, b.utm_content].filter(Boolean).map((v) => String(v).slice(0, 80)).join(' · ');
  return { source, source_detail: detail || null };
}
/** Car, service and message for a lead that did not come through the Studio. */
function readLeadFields(b) {
  const config = normalizeConfig({ model: b.model });
  const typed = String(b.vehicle || b.car || '').trim().slice(0, 80);
  return {
    vehicle: typed || (b.model ? vehicleLabel(config) : null),
    config,
    estimate: 0,
    service: SERVICE_IDS.includes(b.service) ? b.service : null,
    message: String(b.message || '').trim().slice(0, 1000) || null,
  };
}
async function createJob(fields) {
  const customer_id = await upsertCustomer({ name: fields.customer_name, phone: fields.phone, email: fields.email });
  const code = fields.code || (await newCode());
  return must(await sb.from('jobs').insert({ ...fields, code, customer_id }).select('*').single());
}
const addDays = (d) => new Date(Date.now() + d * 86400000).toISOString();

const requireOwner = (req, res, next) => (req.staff?.role === 'owner' ? next() : res.status(403).json({ error: 'Only the owner can do that.' }));

// ---------- serializers ----------
const firstName = (n) => String(n || '').split(' ')[0];
const jobOut = (r) => {
  const { snapshot_path, ...rest } = r;
  return { ...rest, snapshot_url: snapshotUrl(snapshot_path) };
};

// ---------- availability ----------
const ACTIVE = ['booked', 'in_bay', 'curing', 'ready'];
/** Days a job holds its bay: its own length, else its service's standard length. */
const lengthOf = (j, serviceDays) => j.days || serviceDays[j.service] || JOB_DAYS;
const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
async function occupancy(fromIso, days) {
  const [baysSetting, rowsRes, { serviceDays }] = await Promise.all([
    getSetting('bays', 4),
    sb.from('jobs').select('scheduled_date, days, service').not('scheduled_date', 'is', null).in('status', ACTIVE),
    adminSettings(),
  ]);
  const bays = Number(baysSetting) || 4;
  const rows = must(rowsRes);
  const start = new Date(fromIso + 'T00:00:00Z');
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const used = rows.filter((r) => {
      const diff = dayDiff(iso, r.scheduled_date);
      return diff >= 0 && diff < lengthOf(r, serviceDays);
    }).length;
    const closed = d.getUTCDay() === 0;
    out.push({ date: iso, free: closed ? 0 : Math.max(0, bays - used), used, bays, closed });
  }
  return out;
}
// The shop runs on Nairobi time (UTC+3, no daylight saving).
const nairobiDate = (ms = Date.now()) => new Date(ms + 3 * 3600000).toISOString().slice(0, 10);
const todayIso = () => nairobiDate();

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
  const contact = readContact(b);
  if (contact.error) return res.status(400).json({ error: contact.error });
  const config = normalizeConfig(b.config);
  const films = await filmsById();
  if (!films[config.zones.body]) return res.status(400).json({ error: 'Pick a body film first.' });
  const est = estimate(config, films, { labourMultiplier: await getSetting('labourMultiplier', 1) }).total;
  const code = await newCode();
  const snapshot_path = typeof b.snapshot === 'string' ? await saveSnapshot(code, b.snapshot) : null;
  const job = await createJob({
    code,
    ...contact,
    vehicle: vehicleLabel(config),
    message: String(b.message || '').slice(0, 1000) || null,
    preferred_date: /^\d{4}-\d{2}-\d{2}$/.test(b.preferred_date || '') ? b.preferred_date : null,
    config,
    estimate: est,
    snapshot_path,
    service: 'colour',
    ...readSource(b, 'studio'),
  });
  await addEvent(job.id, 'inquiry', 'Build request received from the Studio.');
  res.status(201).json({ code, estimate: est });
});

// Leads from the Instagram automation tool (ManyChat or similar). Authenticated with the x-lw-key header.
api.post('/leads', async (req, res) => {
  const key = String(req.headers['x-lw-key'] || '');
  const expected = await leadIntakeKey();
  if (key.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected))) return res.status(401).json({ error: 'Bad key' });
  const b = req.body || {};
  const contact = readContact(b, { phoneRequired: true });
  if (contact.error) return res.status(400).json({ error: contact.error });
  const job = await createJob({ ...contact, ...readLeadFields(b), ...readSource(b, 'instagram') });
  await addEvent(job.id, 'inquiry', 'Request received. The team will message you with a price.');
  res.status(201).json({ code: job.code });
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
  const [events, quotes, customer, payments, { serviceDays }] = await Promise.all([
    sb.from('job_events').select('*, staff(name)').eq('job_id', r.id).order('created_at', { ascending: false }).order('id', { ascending: false }),
    sb.from('quotes').select('*, staff(name)').eq('job_id', r.id).order('sent_at', { ascending: false }),
    r.customer_id ? sb.from('customers').select('id, name, phone, email').eq('id', r.customer_id).maybeSingle() : { data: null },
    sb.from('payments').select('*, staff(name)').eq('job_id', r.id).order('paid_at', { ascending: false }),
    adminSettings(),
  ]);
  const pays = must(payments);
  const paid = pays.reduce((s, p) => s + p.amount, 0);
  const price = r.final_price ?? r.estimate;
  res.json({ ...jobOut(r), events: must(events), quotes: must(quotes), customer: customer.data, payments: pays, paid, balance: price - paid, length: lengthOf(r, serviceDays) });
});

// ---------- payments: staff record them, only the owner corrects or removes them ----------
const METHODS = ['cash', 'mpesa', 'bank', 'card'];
const KINDS = ['deposit', 'payment', 'balance', 'refund'];
function readPayment(b) {
  const amount = Math.round(Number(b.amount));
  if (!amount) return { error: 'Enter the amount.' };
  const kind = KINDS.includes(b.kind) ? b.kind : 'payment';
  return {
    amount: kind === 'refund' ? -Math.abs(amount) : Math.abs(amount),
    method: METHODS.includes(b.method) ? b.method : 'mpesa',
    kind,
    reference: String(b.reference || '').trim().toUpperCase().slice(0, 40) || null,
    ...(/^\d{4}-\d{2}-\d{2}/.test(b.paid_at || '') ? { paid_at: new Date(b.paid_at).toISOString() } : {}),
  };
}
api.post('/admin/jobs/:id/payments', async (req, res) => {
  const id = Number(req.params.id);
  const job = must(await sb.from('jobs').select('id, status, customer_name').eq('id', id).maybeSingle());
  if (!job) return res.status(404).json({ error: 'Not found' });
  const p = readPayment(req.body || {});
  if (p.error) return res.status(400).json({ error: p.error });
  if (p.reference && must(await sb.from('payments').select('id').eq('reference', p.reference).maybeSingle()))
    return res.status(400).json({ error: `Reference ${p.reference} is already recorded.` });
  const row = must(await sb.from('payments').insert({ ...p, job_id: id, staff_id: req.staff.id }).select('*').single());
  await addEvent(id, null, `${p.kind === 'refund' ? 'Refund' : 'Payment'} of ${money(Math.abs(p.amount))} recorded (${p.method === 'mpesa' ? 'M-Pesa' : p.method}).`, false, nowIso(), req.staff.id);
  must(await sb.from('jobs').update({ updated_at: nowIso() }).eq('id', id));
  await audit(req.staff.id, 'create', 'payment', row.id, null, row);
  res.status(201).json(row);
});
api.patch('/admin/payments/:id', requireOwner, async (req, res) => {
  const cur = must(await sb.from('payments').select('*').eq('id', Number(req.params.id)).maybeSingle());
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const p = readPayment({ ...cur, ...req.body, paid_at: req.body?.paid_at ?? cur.paid_at });
  if (p.error) return res.status(400).json({ error: p.error });
  const row = must(await sb.from('payments').update(p).eq('id', cur.id).select('*').single());
  await audit(req.staff.id, 'update', 'payment', cur.id, cur, row);
  res.json(row);
});
api.delete('/admin/payments/:id', requireOwner, async (req, res) => {
  const cur = must(await sb.from('payments').select('*').eq('id', Number(req.params.id)).maybeSingle());
  if (!cur) return res.status(404).json({ error: 'Not found' });
  must(await sb.from('payments').delete().eq('id', cur.id));
  await audit(req.staff.id, 'delete', 'payment', cur.id, cur, null);
  res.json({ ok: true });
});

// Open requests and quotes, with what needs doing first.
api.get('/admin/leads', async (_req, res) => {
  const [rows, rules] = await Promise.all([
    sb.from('jobs').select('*').in('status', ['inquiry', 'quoted']).order('created_at', { ascending: false }),
    adminSettings(),
  ]);
  const now = Date.now();
  const leads = must(rows).map((j) => {
    const waiting = j.status === 'inquiry' && !j.last_contact_at && now - Date.parse(j.created_at) > rules.followUpHours * 3600000;
    const due = j.next_follow_up_at
      ? Date.parse(j.next_follow_up_at) <= now
      : j.status === 'quoted' && j.last_contact_at && now - Date.parse(j.last_contact_at) > rules.followUpDays * 86400000;
    return { ...jobOut(j), needs_reply: !j.last_contact_at, overdue_reply: waiting, follow_up_due: !!due };
  });
  const rank = (l) => (l.overdue_reply ? 0 : l.needs_reply ? 1 : l.follow_up_due ? 2 : 3);
  // Most urgent first; inside a group the longest-waiting first, except the "nothing due" group, newest first.
  leads.sort((a, b) => rank(a) - rank(b) || (Date.parse(a.created_at) - Date.parse(b.created_at)) * (rank(a) === 3 ? -1 : 1));
  res.json({ leads, rules });
});

// A lead typed in by staff: Instagram DM, phone call, walk-in.
api.post('/admin/leads', async (req, res) => {
  const b = req.body || {};
  const contact = readContact(b);
  if (contact.error) return res.status(400).json({ error: contact.error });
  const job = await createJob({ ...contact, ...readLeadFields(b), ...readSource(b, 'other') });
  const src = LEAD_SOURCES.find((s) => s.id === job.source)?.label || 'Other';
  await addEvent(job.id, 'inquiry', 'Request received. The team will message you with a price.', true, nowIso(), req.staff.id);
  await audit(req.staff.id, 'create', 'job', job.id, null, { source: job.source, customer_name: job.customer_name });
  res.status(201).json({ ...jobOut(job), source_label: src });
});

// ---------- quotes ----------
api.post('/admin/jobs/:id/quotes', async (req, res) => {
  const id = Number(req.params.id);
  const job = must(await sb.from('jobs').select('*').eq('id', id).maybeSingle());
  if (!job) return res.status(404).json({ error: 'Not found' });
  const amount = Math.round(Number(req.body?.amount));
  if (!(amount > 0)) return res.status(400).json({ error: 'Enter the quoted amount.' });
  const note = String(req.body?.note || '').trim().slice(0, 600) || null;
  // Freeze what the price was built from, so the quote never changes when prices do.
  const films = await filmsById();
  const labourMultiplier = await getSetting('labourMultiplier', 1);
  const est = estimate(job.config, films, { labourMultiplier });
  const used = [...new Set(Object.values(job.config?.zones || {}).filter(Boolean))].map((f) => films[f] && { id: f, price: films[f].price, name: films[f].name });
  const snapshot = { estimate: est, labourMultiplier, films: used.filter(Boolean), config: job.config };
  // Earlier open quotes on this job are superseded.
  must(await sb.from('quotes').update({ outcome: 'lost', lost_reason: 'Replaced by a newer quote', decided_at: nowIso() }).eq('job_id', id).eq('outcome', 'open'));
  const quote = must(await sb.from('quotes').insert({ job_id: id, amount, note, snapshot, staff_id: req.staff.id }).select('*').single());
  const { followUpDays } = await adminSettings();
  const next = { final_price: amount, last_contact_at: nowIso(), next_follow_up_at: addDays(followUpDays), updated_at: nowIso() };
  if (job.status === 'inquiry') next.status = 'quoted';
  must(await sb.from('jobs').update(next).eq('id', id));
  if (next.status) await addEvent(id, 'quoted', STATUSES.find((s) => s.id === 'quoted').blurb, true, nowIso(), req.staff.id);
  await audit(req.staff.id, 'create', 'quote', quote.id, null, { job_id: id, amount });
  res.status(201).json(quote);
});

api.patch('/admin/quotes/:id', async (req, res) => {
  const id = Number(req.params.id);
  const cur = must(await sb.from('quotes').select('*').eq('id', id).maybeSingle());
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const outcome = ['open', 'won', 'lost'].includes(req.body?.outcome) ? req.body.outcome : null;
  if (!outcome) return res.status(400).json({ error: 'Bad outcome' });
  const lost_reason = outcome === 'lost' ? String(req.body?.lost_reason || '').trim().slice(0, 300) || null : null;
  const row = must(await sb.from('quotes').update({ outcome, lost_reason, decided_at: outcome === 'open' ? null : nowIso() }).eq('id', id).select('*').single());
  if (outcome === 'lost') {
    must(await sb.from('jobs').update({ status: 'lost', lost_reason, next_follow_up_at: null, updated_at: nowIso() }).eq('id', cur.job_id));
    await addEvent(cur.job_id, 'lost', STATUSES.find((s) => s.id === 'lost').blurb, true, nowIso(), req.staff.id);
  }
  if (outcome === 'won') must(await sb.from('jobs').update({ next_follow_up_at: null, updated_at: nowIso() }).eq('id', cur.job_id));
  await audit(req.staff.id, 'update', 'quote', id, { outcome: cur.outcome }, { outcome, lost_reason });
  res.json(row);
});

// ---------- customers ----------
api.get('/admin/customers', async (_req, res) => {
  const [cust, jobs] = await Promise.all([
    sb.from('customers').select('*').order('updated_at', { ascending: false }),
    sb.from('jobs').select('id, customer_id, status, vehicle, estimate, final_price, created_at'),
  ]);
  const by = {};
  for (const j of must(jobs)) (by[j.customer_id] ||= []).push(j);
  res.json(
    must(cust).map((c) => {
      const list = by[c.id] || [];
      const delivered = list.filter((j) => j.status === 'delivered');
      return {
        ...c,
        jobs: list.length,
        open: list.filter((j) => !['delivered', 'lost', 'no_show'].includes(j.status)).length,
        spend: delivered.reduce((s, j) => s + (j.final_price ?? j.estimate), 0),
        cars: [...new Set(list.map((j) => j.vehicle).filter(Boolean))],
        last_at: list.reduce((m, j) => (j.created_at > m ? j.created_at : m), c.created_at),
      };
    }),
  );
});

api.get('/admin/customers/:id', async (req, res) => {
  const c = must(await sb.from('customers').select('*').eq('id', Number(req.params.id)).maybeSingle());
  if (!c) return res.status(404).json({ error: 'Not found' });
  const jobs = must(await sb.from('jobs').select('*').eq('customer_id', c.id).order('created_at', { ascending: false }));
  res.json({ ...c, jobs: jobs.map(jobOut) });
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
  for (const k of ['customer_name', 'email', 'vehicle', 'notes']) if (b[k] !== undefined) next[k] = String(b[k] ?? '').trim().slice(0, 2000) || null;
  if (next.customer_name === null) return res.status(400).json({ error: 'Name is required.' });
  if (next.email && !EMAIL_RE.test(next.email)) return res.status(400).json({ error: 'That email address does not look right.' });
  if (b.phone !== undefined) next.phone = normPhone(b.phone);
  if (b.source !== undefined && SOURCE_IDS.includes(b.source)) next.source = b.source;
  if (b.service !== undefined) next.service = SERVICE_IDS.includes(b.service) ? b.service : null;
  if (b.contacted) {
    next.last_contact_at = nowIso();
    if (b.next_follow_up_at === undefined) next.next_follow_up_at = addDays((await adminSettings()).followUpDays);
  }
  if (b.next_follow_up_at !== undefined) next.next_follow_up_at = /^\d{4}-\d{2}-\d{2}/.test(b.next_follow_up_at || '') ? new Date(b.next_follow_up_at).toISOString() : null;
  if (['customer_name', 'phone', 'email'].some((k) => k in next)) {
    const merged = { ...cur, ...next };
    next.customer_id = await upsertCustomer({ name: merged.customer_name, phone: merged.phone, email: merged.email });
  }
  if (b.final_price !== undefined) next.final_price = b.final_price === null || b.final_price === '' ? null : Math.round(Number(b.final_price)) || 0;
  if (b.scheduled_date !== undefined) next.scheduled_date = /^\d{4}-\d{2}-\d{2}$/.test(b.scheduled_date || '') ? b.scheduled_date : null;
  if (b.bay !== undefined) next.bay = b.bay === null || b.bay === '' ? null : Number(b.bay);
  if (b.featured !== undefined) next.featured = !!b.featured;
  if (b.days !== undefined) next.days = b.days === null || b.days === '' ? null : Math.max(1, Math.min(30, Math.round(Number(b.days)) || 1));
  // A bay holds one car at a time.
  const after = { ...cur, ...next };
  const placementChanged = ['status', 'scheduled_date', 'bay', 'days', 'service'].some((k) => k in next && next[k] !== cur[k]);
  if (placementChanged && ACTIVE.includes(after.status) && after.scheduled_date && after.bay) {
    const { serviceDays } = await adminSettings();
    const others = must(await sb.from('jobs').select('id, code, customer_name, scheduled_date, days, service').eq('bay', after.bay).in('status', ACTIVE).neq('id', id).not('scheduled_date', 'is', null));
    const len = lengthOf(after, serviceDays);
    const clash = others.find((o) => {
      const d = dayDiff(o.scheduled_date, after.scheduled_date);
      return d < len && -d < lengthOf(o, serviceDays);
    });
    if (clash) return res.status(409).json({ error: `Bay ${after.bay} is taken by ${clash.customer_name} (${clash.code}) from ${clash.scheduled_date}. Pick another bay or date.` });
  }
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
  const changed = Object.keys(next).filter((k) => !['updated_at', 'last_contact_at', 'next_follow_up_at'].includes(k) && next[k] !== cur[k]);
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
  const { count: paidCount } = await sb.from('payments').select('id', { count: 'exact', head: true }).eq('job_id', Number(req.params.id));
  if (paidCount) return res.status(400).json({ error: 'This job has payments recorded. Mark it lost instead, or remove the payments first.' });
  if (r) await audit(req.staff.id, 'delete', 'job', r.id, r, null);
  if (r?.snapshot_path) await sb.storage.from('snapshots').remove([r.snapshot_path]);
  must(await sb.from('jobs').delete().eq('id', Number(req.params.id)));
  res.json({ ok: true });
});

api.get('/admin/schedule', async (req, res) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : todayIso();
  const [days, rows, { serviceDays }] = await Promise.all([
    occupancy(from, 14),
    sb.from('jobs').select('id, days, service').in('status', ACTIVE),
    adminSettings(),
  ]);
  res.json({ days, jobDays: JOB_DAYS, lengths: Object.fromEntries(must(rows).map((j) => [j.id, lengthOf(j, serviceDays)])) });
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

api.get('/admin/settings', async (_req, res) => res.json({ ...(await publicSettings()), ...(await adminSettings()) }));

// The secret the Instagram tool uses to post leads (owner only). POST rotates it.
api.get('/admin/intake-key', requireOwner, async (_req, res) => res.json({ key: await leadIntakeKey() }));
api.post('/admin/intake-key', requireOwner, async (req, res) => {
  const key = await leadIntakeKey({ rotate: true });
  await audit(req.staff.id, 'update', 'settings', 'leadIntakeKey', null, { rotated: true });
  res.json({ key });
});
api.put('/admin/settings', requireOwner, async (req, res) => {
  const b = req.body || {};
  const patch = {};
  for (const k of PUBLIC_SETTING_KEYS) {
    if (b[k] === undefined) continue;
    if (k === 'bays') patch[k] = Math.max(1, Math.min(20, Math.round(Number(b[k]) || 1)));
    else if (k === 'labourMultiplier') patch[k] = Math.max(0.5, Math.min(3, Number(b[k]) || 1));
    else patch[k] = String(b[k]).slice(0, 200);
  }
  if (b.followUpHours !== undefined) patch.followUpHours = Math.max(1, Math.min(72, Number(b.followUpHours) || ADMIN_SETTING_DEFAULTS.followUpHours));
  if (b.followUpDays !== undefined) patch.followUpDays = Math.max(1, Math.min(30, Number(b.followUpDays) || ADMIN_SETTING_DEFAULTS.followUpDays));
  if (b.serviceDays && typeof b.serviceDays === 'object')
    patch.serviceDays = Object.fromEntries(SERVICE_IDS.map((k) => [k, Math.max(1, Math.min(30, Math.round(Number(b.serviceDays[k])) || ADMIN_SETTING_DEFAULTS.serviceDays[k]))]));
  const all = async () => ({ ...(await publicSettings()), ...(await adminSettings()) });
  const before = await all();
  await setSettings(patch);
  const after = await all();
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

/** The owner's five questions, plus the money view. */
async function ownerDay() {
  const [jobsRes, paysRes] = await Promise.all([
    sb.from('jobs').select('id, code, status, customer_name, phone, vehicle, service, bay, scheduled_date, estimate, final_price, last_contact_at, created_at'),
    sb.from('payments').select('job_id, amount, paid_at'),
  ]);
  const jobs = must(jobsRes);
  const pays = must(paysRes);
  const today = todayIso();
  const paidBy = {};
  for (const p of pays) paidBy[p.job_id] = (paidBy[p.job_id] || 0) + p.amount;
  const brief = (j) => ({ id: j.id, code: j.code, customer_name: j.customer_name, phone: j.phone, vehicle: j.vehicle, status: j.status, bay: j.bay });
  const price = (j) => j.final_price ?? j.estimate;
  const owing = jobs
    .filter((j) => [...ACTIVE, 'delivered'].includes(j.status))
    .map((j) => ({ ...brief(j), price: price(j), paid: paidBy[j.id] || 0, owed: price(j) - (paidBy[j.id] || 0) }))
    .filter((j) => j.owed > 0)
    .sort((a, b) => (a.status === 'delivered' ? -1 : 0) - (b.status === 'delivered' ? -1 : 0) || b.owed - a.owed);
  const sumSince = (iso) => pays.filter((p) => nairobiDate(Date.parse(p.paid_at)) >= iso).reduce((s, p) => s + p.amount, 0);
  const monthStart = today.slice(0, 8) + '01';
  const serviceOf = Object.fromEntries(jobs.map((j) => [j.id, j.service || 'other']));
  const byService = {};
  for (const p of pays) if (nairobiDate(Date.parse(p.paid_at)) >= monthStart) byService[serviceOf[p.job_id]] = (byService[serviceOf[p.job_id]] || 0) + p.amount;
  const waiting = jobs.filter((j) => j.status === 'inquiry' && !j.last_contact_at).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return {
    day: {
      inBays: jobs.filter((j) => ['in_bay', 'curing', 'ready'].includes(j.status)).map(brief).sort((a, b) => (a.bay || 99) - (b.bay || 99)),
      arriving: jobs.filter((j) => j.status === 'booked' && j.scheduled_date === today).map(brief),
      waiting: { count: waiting.length, oldest: waiting.slice(0, 3).map(brief) },
      takenToday: sumSince(today),
      owed: { total: owing.reduce((s, j) => s + j.owed, 0), jobs: owing.slice(0, 8) },
    },
    money: {
      today: sumSince(today),
      week: sumSince(nairobiDate(Date.now() - 6 * 86400000)),
      month: sumSince(monthStart),
      expected: owing.filter((j) => ACTIVE.includes(j.status)).reduce((s, j) => s + j.owed, 0),
      byService: Object.entries(byService).map(([service, amount]) => ({ service, amount })).sort((a, b) => b.amount - a.amount),
    },
  };
}

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
    ...(await ownerDay()),
  });
});

api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
api.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});
