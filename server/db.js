import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { need } from './env.js';
import { estimate, normalizeConfig, vehicleLabel, STATUSES } from '../shared/catalog.js';

export const sb = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Unwrap a supabase response or throw. */
export function must({ data, error }) {
  if (error) throw Object.assign(new Error(error.message), { status: 500, detail: error });
  return data;
}

export const nowIso = () => new Date().toISOString();

// ---------- settings (cached; tiny table) ----------
let settingsCache = null;
async function loadSettings() {
  if (!settingsCache) {
    const rows = must(await sb.from('settings').select('key, value'));
    settingsCache = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
  return settingsCache;
}
export async function getSetting(key, fallback = null) {
  const s = await loadSettings();
  return key in s ? s[key] : fallback;
}
export async function setSettings(obj) {
  const rows = Object.entries(obj).map(([key, value]) => ({ key, value }));
  must(await sb.from('settings').upsert(rows));
  settingsCache = null;
}

export const PUBLIC_SETTING_KEYS = ['shopName', 'tagline', 'phone', 'email', 'address', 'city', 'hours', 'bays', 'labourMultiplier', 'instagram'];
export async function publicSettings() {
  const s = await loadSettings();
  return Object.fromEntries(PUBLIC_SETTING_KEYS.map((k) => [k, s[k] ?? null]));
}

// ---------- passwords ----------
export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  return crypto.timingSafeEqual(crypto.scryptSync(pw, salt, 32), Buffer.from(hash, 'hex'));
}

// ---------- films / jobs ----------
export const filmRow = (r) => ({ ...r, price: Number(r.price) });
export async function filmsById() {
  const rows = must(await sb.from('films').select('*'));
  return Object.fromEntries(rows.map((r) => [r.id, filmRow(r)]));
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export async function newCode() {
  for (;;) {
    let s = '';
    for (const b of crypto.randomBytes(5)) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
    const code = `LW-${s}`;
    const hit = must(await sb.from('jobs').select('id').eq('code', code).maybeSingle());
    if (!hit) return code;
  }
}

export async function addEvent(jobId, status, message, isPublic = true, at = nowIso(), staffId = null) {
  must(await sb.from('job_events').insert({ job_id: jobId, status, message, public: isPublic, created_at: at, staff_id: staffId }));
}

// ---------- staff, change trail, rate limits ----------
/** Record who changed what. Never blocks the request on failure. */
export async function audit(staffId, action, entity, entityId, before = null, after = null) {
  const { error } = await sb.from('audit_log').insert({ staff_id: staffId ?? null, action, entity, entity_id: entityId == null ? null : String(entityId), before, after });
  if (error) console.warn('audit failed:', error.message);
}

/** True when `key` has hit `max` events inside `windowMs`; otherwise records this hit. Shared across instances. */
export async function rateLimited(key, max, windowMs) {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await sb.from('rate_hits').select('key', { count: 'exact', head: true }).eq('key', key).gte('at', since);
  if (error) return false; // fail open: never lock customers out because of the limiter
  if (count >= max) return true;
  await sb.from('rate_hits').insert({ key });
  if (Math.random() < 0.02) await sb.from('rate_hits').delete().lt('at', new Date(Date.now() - 86400000).toISOString());
  return false;
}
export async function clearRate(key) {
  await sb.from('rate_hits').delete().eq('key', key);
}

export const normLogin = (s) => String(s || '').trim().toLowerCase().slice(0, 120);

/** First run after the staff migration: turn the old shared password into an "owner" account. Returns the login or null. */
export async function ensureOwner() {
  const { count } = await sb.from('staff').select('id', { count: 'exact', head: true });
  if (count) return null;
  const hash = await getSetting('adminPassword');
  if (!hash) return null;
  must(await sb.from('staff').insert({ name: 'Owner', login: 'owner', password_hash: hash, role: 'owner' }));
  return 'owner';
}

export function snapshotUrl(path) {
  return path ? sb.storage.from('snapshots').getPublicUrl(path).data.publicUrl : null;
}

/** Store a data: URL render in the snapshots bucket. Returns the object path or null. */
export async function saveSnapshot(code, dataUrl) {
  const m = /^data:(image\/(webp|png|jpeg));base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 3 * 1024 * 1024) return null;
  const path = `${code}-${Date.now()}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`;
  const { error } = await sb.storage.from('snapshots').upload(path, buf, { contentType: m[1], upsert: true });
  if (error) {
    console.warn('snapshot upload failed:', error.message);
    return null;
  }
  return path;
}

// ---------- seed ----------
const FILMS = [
  // id, brand, name, finish, hex, hex2, KES per sq ft, featured
  ['ino-midnight-purple', 'Inozetek', 'Midnight Purple', 'metallic', '#3a1a63', null, 390, true],
  ['leg-legacy-orange', 'Legacy Select', 'Legacy Orange', 'gloss', '#ff5a1f', null, 300, true],
  ['avy-nardo', 'Avery Dennison', 'Concrete Grey', 'gloss', '#8b8e8f', null, 310, true],
  ['3m-gloss-black', '3M', 'Gloss Black', 'gloss', '#0b0b0d', null, 300, false],
  ['3m-racing-red', '3M', 'Hot Rod Red', 'gloss', '#c3131b', null, 310, false],
  ['teck-safari-yellow', 'TeckWrap', 'Safari Yellow', 'gloss', '#f2c300', null, 240, false],
  ['ino-miami-blue', 'Inozetek', 'Lagoon Blue', 'gloss', '#00a3c7', null, 340, true],
  ['avy-mint', 'Avery Dennison', 'Mint Leaf', 'gloss', '#9ad8c1', null, 310, false],
  ['avy-pearl-white', 'Avery Dennison', 'Pearl White', 'gloss', '#f1f1ee', null, 320, false],
  ['teck-kenya-green', 'TeckWrap', 'Highland Green', 'gloss', '#0b6b3a', null, 240, false],
  ['3m-satin-dark-grey', '3M', 'Satin Dark Grey', 'satin', '#3b3d40', null, 340, true],
  ['3m-satin-blood-red', '3M', 'Satin Oxblood', 'satin', '#6e0b14', null, 350, false],
  ['avy-satin-khaki', 'Avery Dennison', 'Satin Khaki', 'satin', '#6b6a4c', null, 340, true],
  ['3m-satin-perfect-blue', '3M', 'Satin Cobalt', 'satin', '#1f3c8f', null, 350, false],
  ['3m-matte-black', '3M', 'Matte Black', 'matte', '#151516', null, 310, false],
  ['ora-matte-military', 'Oracal', 'Matte Field Green', 'matte', '#45503b', null, 280, false],
  ['ino-matte-chalk', 'Inozetek', 'Matte Chalk', 'matte', '#e4e2db', null, 330, true],
  ['teck-matte-murram', 'TeckWrap', 'Matte Murram', 'matte', '#9c5a32', null, 230, true],
  ['avy-brg', 'Avery Dennison', 'Racing Green', 'metallic', '#0f3b2a', null, 370, false],
  ['3m-galaxy-blue', '3M', 'Deep Space Blue', 'metallic', '#13275e', null, 380, false],
  ['kpmf-champagne', 'KPMF', 'Champagne', 'metallic', '#b9a07a', null, 370, false],
  ['3m-psychedelic', '3M', 'Psychedelic Flip', 'shift', '#4b1f7a', '#1fa27a', 650, true],
  ['avy-ghost-pearl', 'Avery Dennison', 'Ghost Pearl', 'shift', '#e8eef5', '#7aa8ff', 620, false],
  ['3m-volcanic', '3M', 'Volcanic Flare', 'shift', '#8a0f1c', '#e0a12b', 650, false],
  ['avy-silver-chrome', 'Avery Dennison', 'Silver Chrome', 'chrome', '#d9dde2', null, 920, false],
  ['kpmf-rose-chrome', 'KPMF', 'Rose Gold Chrome', 'chrome', '#c98d7a', null, 950, true],
  ['3m-carbon', '3M', 'Carbon Fibre', 'carbon', '#1c1c1e', null, 520, false],
];

// name, model id, year, plate
const PEOPLE = [
  ['Kevin Mwangi', 'mercedes-g63', '2019', 'KDK 512M'],
  ['Achieng Odhiambo', 'mercedes-gle-coupe', '2021', 'KDJ 774C'],
  ['Brian Otieno', 'mazda-atenza', '2017', 'KCZ 908T'],
  ['Wanjiru Kamau', 'mazda-cx5', '2019', 'KDA 219P'],
  ['Abdi Hassan', 'toyota-prado', '2024', 'KDH 001A'],
  ['Amina Yusuf', 'range-rover-sport', '2018', 'KDE 640Q'],
  ['Dennis Kiprop', 'mercedes-g63', '2021', 'KDP 388V'],
  ['Collins Ouma', 'mercedes-c63', '2015', 'KCX 452B'],
  ['Hassan Omar', 'mercedes-gle-coupe', '2022', 'KDF 120K'],
  ['Grace Wairimu', 'porsche-cayenne', '2019', 'KDG 903L'],
  ['Peter Kariuki', 'range-rover-sport', '2019', 'KDM 777R'],
  ['Faith Njeri', 'mazda-atenza', '2018', 'KDB 315S'],
  ['Mercy Chebet', 'bmw-x5', '2018', 'KDC 562D'],
  ['Samuel Rotich', 'land-rover-defender', '2022', 'KDR 044J'],
  ['Joy Akinyi', 'mazda-cx5', '2020', 'KDA 870F'],
  ['Lilian Muthoni', 'toyota-prado', '2025', 'KDL 129X'],
];

// status, days ago created, scheduled offset (days from today) or null, bay, featured, body film, extras
const PLAN = [
  ['delivered', 68, -55, 1, true, '3m-satin-dark-grey', { calipers: 'yellow', wheels: 'gloss-black', ppf: 'front' }],
  ['delivered', 61, -46, 2, true, 'ino-midnight-purple', { roof: '3m-gloss-black', calipers: 'orange' }],
  ['delivered', 52, -38, 3, true, 'ino-miami-blue', { wheels: 'gold', calipers: 'red' }],
  ['delivered', 44, -30, 1, true, '3m-psychedelic', { wheels: 'gloss-black', calipers: 'lime' }],
  ['delivered', 37, -22, 2, true, 'teck-matte-murram', { roof: '3m-matte-black', wheels: 'gloss-black', tint: 3 }],
  ['delivered', 30, -15, 4, true, 'kpmf-rose-chrome', { wheels: 'gloss-black' }],
  ['ready', 21, -2, 3, false, 'avy-satin-khaki', { hood: '3m-matte-black', wheels: 'matte-white' }],
  ['curing', 18, -1, 1, false, 'avy-brg', { wheels: 'gold', calipers: 'yellow', ceramic: true }],
  ['in_bay', 15, 0, 2, false, 'teck-safari-yellow', { roof: '3m-gloss-black' }],
  ['booked', 12, 2, 1, false, '3m-volcanic', { wheels: 'gloss-black' }],
  ['booked', 10, 4, 3, false, 'avy-nardo', { calipers: 'red', ppf: 'full', ppfFinish: 'stealth' }],
  ['booked', 9, 6, 2, false, 'avy-mint', { wheels: 'matte-white' }],
  ['quoted', 6, null, null, false, '3m-satin-perfect-blue', { roof: '3m-gloss-black', mirrors: '3m-gloss-black' }],
  ['quoted', 4, null, null, false, 'ino-matte-chalk', { wheels: 'gloss-black', tint: 3 }],
  ['inquiry', 2, null, null, false, '3m-satin-blood-red', { wheels: 'gloss-black', calipers: 'stock' }],
  ['inquiry', 0, null, null, false, 'ora-matte-military', { wheels: 'matte-white', ceramic: true }],
];

const NOTES = ['Wants door shuts done too — quote separately.', 'Bring car washed, no wax for 7 days prior.', 'Stone chips on front bumper from Mombasa Rd — touch up before PPF.', 'Prefers WhatsApp over calls.', ''];
const MESSAGES = ['Want something subtle but not boring. Daily driver.', 'Will the colour shift hold up in Nairobi sun?', 'Can you remove the badges too?', 'Need it done before the Safari Rally weekend in Naivasha.', 'Would love to see samples in person first.'];
const EVENT_COPY = {
  inquiry: 'Build request received from the Studio.',
  quoted: 'Final quote sent on WhatsApp.',
  booked: 'Deposit received via M-Pesa. Bay reserved.',
  in_bay: 'Car checked in. Decon wash and disassembly started.',
  curing: 'Install complete. Post-heating edges, 24h cure.',
  ready: 'Final QC passed. Ready for pickup.',
  delivered: 'Handed over. Aftercare guide provided.',
};
const ORDER = STATUSES.filter((x) => !x.closed).map((x) => x.id);

function isoDay(offsetDays, hour = 9) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}
const localDate = (iso) => new Date(iso).toLocaleDateString('en-CA');

export async function seed({ force = false } = {}) {
  const { count } = await sb.from('films').select('id', { count: 'exact', head: true });
  if (count && !force) return false;

  must(await sb.from('jobs').delete().gte('id', 0)); // cascades to job_events
  must(await sb.from('films').delete().neq('id', ''));
  must(await sb.from('settings').delete().neq('key', ''));

  must(
    await sb.from('films').insert(
      FILMS.map((f, i) => ({ id: f[0], brand: f[1], name: f[2], finish: f[3], hex: f[4], hex2: f[5], price: f[6], featured: f[7], in_stock: i !== 22, sort: i })),
    ),
  );

  await setSettings({
    shopName: 'Legacy Wraps',
    tagline: 'Colour change, protection film and tint. Designed in 3D, installed by hand.',
    phone: '+254 700 000 254',
    email: 'studio@legacywraps.example',
    address: 'Unit 4, Foundry Park, Mombasa Road',
    city: 'Nairobi',
    hours: 'Mon–Fri 8:00–18:00 · Sat 9:00–15:00',
    instagram: '@legacywraps',
    bays: 4,
    labourMultiplier: 1,
    adminPassword: hashPassword(process.env.ADMIN_PASSWORD || 'legacy2026'),
    sessionSecret: crypto.randomBytes(32).toString('hex'),
  });

  const films = await filmsById();
  for (let i = 0; i < PLAN.length; i++) {
    const [status, ago, sched, bay, featured, bodyFilm, extra] = PLAN[i];
    const [name, model, year, plate] = PEOPLE[i];
    const { roof = null, hood = null, mirrors = null, ...rest } = extra;
    const config = normalizeConfig({
      model,
      year,
      zones: { body: bodyFilm, roof, hood, mirrors },
      chromeDelete: i % 3 !== 0,
      tint: 2,
      plate,
      ...rest,
    });
    const vehicle = vehicleLabel(config);
    const est = estimate(config, films).total;
    const stage = ORDER.indexOf(status);
    const created = isoDay(-ago, 10 + (i % 7));
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '.');
    const job = must(
      await sb
        .from('jobs')
        .insert({
          code: await newCode(),
          status,
          customer_name: name,
          email: `${slug}@example.com`,
          phone: `+254 7${(10 + i * 7) % 100} ${String(100 + i * 53).slice(-3)} ${String(400 + i * 37).slice(-3)}`,
          vehicle,
          message: MESSAGES[i % MESSAGES.length],
          preferred_date: sched === null ? localDate(isoDay(10 + i)) : null,
          config,
          estimate: est,
          final_price: stage >= 1 ? Math.round((est * (0.96 + (i % 5) * 0.02)) / 500) * 500 : null,
          scheduled_date: sched === null ? null : localDate(isoDay(sched)),
          bay,
          notes: NOTES[i % NOTES.length],
          featured,
          created_at: created,
          updated_at: isoDay(Math.min(sched ?? -ago, 0), 8),
        })
        .select('id')
        .single(),
    );
    const events = [];
    for (let s = 0; s <= stage; s++) {
      let at;
      if (s === 0) at = created;
      else if (sched === null) at = isoDay(-ago + s, 11);
      else at = s <= 2 ? isoDay(Math.min(-ago + s * 2, sched - 1), 12) : isoDay(sched + (s - 3), 9 + s);
      events.push({ job_id: job.id, status: ORDER[s], message: EVENT_COPY[ORDER[s]], public: true, created_at: at });
    }
    must(await sb.from('job_events').insert(events));
  }
  return true;
}
