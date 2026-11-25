// Shared between the browser (Studio, admin) and the server (quotes, seed).
// Keep this file dependency-free. Prices are in Kenyan shillings (KES).

export const CURRENCY = 'KES';

export const FINISHES = [
  { id: 'gloss', label: 'Gloss' },
  { id: 'satin', label: 'Satin' },
  { id: 'matte', label: 'Matte' },
  { id: 'metallic', label: 'Metallic' },
  { id: 'shift', label: 'Colour shift' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'carbon', label: 'Carbon' },
];

/**
 * Size classes drive pricing. sqft = film needed for a full colour change,
 * labour = base install labour in KES. Other figures are KES add-ons.
 */
export const CLASSES = {
  sedan: { label: 'Saloon', sqft: 245, labour: 85000, roof: 18, hood: 20, chromeDelete: 18000, ppfFront: 95000, ppfFull: 450000, ceramic: 55000, stripes: 28000 },
  wagon: { label: 'Estate', sqft: 260, labour: 90000, roof: 24, hood: 20, chromeDelete: 18000, ppfFront: 95000, ppfFull: 470000, ceramic: 58000, stripes: 30000 },
  suv: { label: 'SUV', sqft: 300, labour: 110000, roof: 28, hood: 24, chromeDelete: 25000, ppfFront: 110000, ppfFull: 550000, ceramic: 65000, stripes: 32000 },
  suvcoupe: { label: 'Coupé SUV', sqft: 300, labour: 115000, roof: 26, hood: 24, chromeDelete: 25000, ppfFront: 110000, ppfFull: 560000, ceramic: 65000, stripes: 32000 },
  boxy: { label: 'Full-size 4x4', sqft: 345, labour: 130000, roof: 34, hood: 28, chromeDelete: 30000, ppfFront: 125000, ppfFull: 620000, ceramic: 75000, stripes: 36000 },
  gwagon: { label: 'G-Class', sqft: 360, labour: 150000, roof: 30, hood: 22, chromeDelete: 35000, ppfFront: 130000, ppfFull: 680000, ceramic: 80000, stripes: 38000 },
  pickup: { label: 'Double cab', sqft: 320, labour: 115000, roof: 18, hood: 28, chromeDelete: 25000, ppfFront: 110000, ppfFull: 560000, ceramic: 65000, stripes: 34000 },
};

/**
 * Premium vehicles common on Kenyan roads (Nairobi focus).
 * dims: length, width, height, wheelbase in metres (approximate published specs for the listed generation).
 * shape: which silhouette template the 3D studio uses. wheel: tyre outer radius (m).
 */
export const MODELS = [
  // Mercedes-Benz
  { id: 'mercedes-c200', make: 'Mercedes-Benz', model: 'C 200', gen: 'W205', shape: 'sedan', dims: [4.686, 1.81, 1.442, 2.84], wheel: 0.33 },
  { id: 'mercedes-c63', make: 'Mercedes-AMG', model: 'C 63 S', gen: 'W205', shape: 'sedan', dims: [4.751, 1.839, 1.426, 2.84], wheel: 0.34 },
  { id: 'mercedes-e250', make: 'Mercedes-Benz', model: 'E 250', gen: 'W212', shape: 'sedan', dims: [4.868, 1.854, 1.474, 2.874], wheel: 0.34 },
  { id: 'mercedes-glc43', make: 'Mercedes-AMG', model: 'GLC 43', gen: 'X253', shape: 'suv', dims: [4.671, 1.89, 1.639, 2.873], wheel: 0.37 },
  { id: 'mercedes-glc63', make: 'Mercedes-AMG', model: 'GLC 63 S', gen: 'X253', shape: 'suv', dims: [4.736, 1.931, 1.584, 2.873], wheel: 0.37 },
  { id: 'mercedes-gle250', make: 'Mercedes-Benz', model: 'GLE 250d', gen: 'W166', shape: 'suv', dims: [4.819, 1.935, 1.796, 2.915], wheel: 0.38 },
  { id: 'mercedes-gle400', make: 'Mercedes-Benz', model: 'GLE 400', gen: 'W166', shape: 'suv', dims: [4.924, 1.947, 1.772, 2.995], wheel: 0.38 },
  { id: 'mercedes-gle-coupe', make: 'Mercedes-AMG', model: 'GLE 63 S Coupé', gen: 'C167', shape: 'suvcoupe', dims: [4.961, 2.014, 1.716, 2.935], wheel: 0.4 },
  { id: 'mercedes-g63', make: 'Mercedes-AMG', model: 'G 63', gen: 'W463A', shape: 'gwagon', dims: [4.873, 1.984, 1.966, 2.89], wheel: 0.41 },
  // Mazda
  { id: 'mazda-atenza', make: 'Mazda', model: 'Atenza', gen: 'GJ', shape: 'sedan', dims: [4.865, 1.84, 1.45, 2.83], wheel: 0.33 },
  { id: 'mazda-atenza-wagon', make: 'Mazda', model: 'Atenza Wagon', gen: 'GJ', shape: 'wagon', dims: [4.805, 1.84, 1.48, 2.75], wheel: 0.33 },
  { id: 'mazda-cx5', make: 'Mazda', model: 'CX-5', gen: 'KF', shape: 'suv', dims: [4.575, 1.845, 1.69, 2.7], wheel: 0.35 },
  { id: 'mazda-cx8', make: 'Mazda', model: 'CX-8', gen: 'KG', shape: 'suv', dims: [4.9, 1.84, 1.73, 2.93], wheel: 0.36 },
  // BMW
  { id: 'bmw-530i', make: 'BMW', model: '530i', gen: 'G30', shape: 'sedan', dims: [4.936, 1.868, 1.479, 2.975], wheel: 0.34 },
  { id: 'bmw-x5', make: 'BMW', model: 'X5', gen: 'G05', shape: 'suv', dims: [4.922, 2.004, 1.745, 2.975], wheel: 0.39 },
  { id: 'bmw-x6', make: 'BMW', model: 'X6', gen: 'G06', shape: 'suvcoupe', dims: [4.935, 2.004, 1.696, 2.975], wheel: 0.39 },
  // Toyota & Lexus
  { id: 'toyota-lc300', make: 'Toyota', model: 'Land Cruiser 300', gen: 'J300', shape: 'boxy', dims: [4.985, 1.98, 1.925, 2.85], wheel: 0.41 },
  { id: 'toyota-lc200', make: 'Toyota', model: 'Land Cruiser V8', gen: 'J200', shape: 'boxy', dims: [4.95, 1.98, 1.905, 2.85], wheel: 0.4 },
  { id: 'toyota-prado', make: 'Toyota', model: 'Land Cruiser Prado', gen: 'J250', shape: 'boxy', dims: [4.925, 1.98, 1.87, 2.85], wheel: 0.4 },
  { id: 'lexus-lx570', make: 'Lexus', model: 'LX 570', gen: 'J200', shape: 'boxy', dims: [5.065, 1.98, 1.865, 2.85], wheel: 0.41 },
  // Land Rover
  { id: 'range-rover-vogue', make: 'Land Rover', model: 'Range Rover Vogue', gen: 'L405', shape: 'boxy', dims: [4.999, 1.983, 1.835, 2.922], wheel: 0.4 },
  { id: 'range-rover-sport', make: 'Land Rover', model: 'Range Rover Sport', gen: 'L494', shape: 'boxy', dims: [4.879, 1.983, 1.78, 2.923], wheel: 0.39 },
  { id: 'land-rover-defender', make: 'Land Rover', model: 'Defender 110', gen: 'L663', shape: 'gwagon', dims: [4.758, 1.996, 1.967, 3.022], wheel: 0.4 },
  // Porsche, Audi, VW, Subaru, Ford
  { id: 'porsche-cayenne', make: 'Porsche', model: 'Cayenne', gen: 'E3', shape: 'suv', dims: [4.918, 1.983, 1.696, 2.895], wheel: 0.39 },
  { id: 'porsche-macan', make: 'Porsche', model: 'Macan', gen: '95B', shape: 'suv', dims: [4.696, 1.923, 1.624, 2.807], wheel: 0.37 },
  { id: 'audi-q7', make: 'Audi', model: 'Q7', gen: '4M', shape: 'suv', dims: [5.052, 1.968, 1.741, 2.994], wheel: 0.39 },
  { id: 'vw-touareg', make: 'Volkswagen', model: 'Touareg', gen: 'CR', shape: 'suv', dims: [4.878, 1.984, 1.717, 2.899], wheel: 0.39 },
  { id: 'subaru-wrx', make: 'Subaru', model: 'WRX STI', gen: 'VA', shape: 'sedan', dims: [4.595, 1.795, 1.475, 2.65], wheel: 0.33 },
  { id: 'ford-ranger-raptor', make: 'Ford', model: 'Ranger Raptor', gen: 'P703', shape: 'pickup', dims: [5.381, 2.028, 1.926, 3.27], wheel: 0.42 },
];
export const MAKE_GROUPS = [
  { id: 'mercedes', label: 'Mercedes-Benz', match: (m) => m.make.startsWith('Mercedes') },
  { id: 'mazda', label: 'Mazda', match: (m) => m.make === 'Mazda' },
  { id: 'bmw', label: 'BMW', match: (m) => m.make === 'BMW' },
  { id: 'toyota', label: 'Toyota & Lexus', match: (m) => m.make === 'Toyota' || m.make === 'Lexus' },
  { id: 'landrover', label: 'Land Rover', match: (m) => m.make === 'Land Rover' },
  { id: 'more', label: 'More', match: (m) => ['Porsche', 'Audi', 'Volkswagen', 'Subaru', 'Ford'].includes(m.make) },
];
export const modelById = (id) => MODELS.find((m) => m.id === id) || MODELS[0];
export const modelName = (m) => `${m.make} ${m.model}`;

export const WHEELS = [
  { id: 'stock', label: 'Stock silver', hex: '#c4c7cc', finish: 'metallic', price: 0 },
  { id: 'gloss-black', label: 'Gloss black', hex: '#0d0d0f', finish: 'gloss', price: 32000 },
  { id: 'satin-bronze', label: 'Satin bronze', hex: '#7a5a34', finish: 'satin', price: 32000 },
  { id: 'gunmetal', label: 'Gunmetal', hex: '#3b3e44', finish: 'metallic', price: 32000 },
  { id: 'matte-white', label: 'Matte white', hex: '#e9e9e6', finish: 'matte', price: 32000 },
  { id: 'gold', label: 'Rally gold', hex: '#b8913f', finish: 'metallic', price: 36000 },
];

export const CALIPERS = [
  { id: 'stock', label: 'Stock', hex: '#3a3a3c', price: 0 },
  { id: 'red', label: 'Race red', hex: '#d4161c', price: 18000 },
  { id: 'yellow', label: 'Signal yellow', hex: '#f5c400', price: 18000 },
  { id: 'lime', label: 'Acid lime', hex: '#9be22d', price: 18000 },
  { id: 'blue', label: 'Electric blue', hex: '#1f5bff', price: 18000 },
  { id: 'orange', label: 'Legacy orange', hex: '#ff5a1f', price: 18000 },
];

// Kenyan law caps front-side tint; the studio flags darker options as off-road/show only.
export const TINT = [
  { id: 0, label: 'None', vlt: 'Factory', price: 0, opacity: 0.38 },
  { id: 1, label: '50%', vlt: '50% VLT', price: 15000, opacity: 0.55 },
  { id: 2, label: '35%', vlt: '35% VLT', price: 18000, opacity: 0.7 },
  { id: 3, label: '20%', vlt: '20% VLT', price: 22000, opacity: 0.83 },
  { id: 4, label: 'Limo', vlt: '5% VLT', price: 25000, opacity: 0.94 },
];

export const STRIPES = [
  { id: 'none', label: 'None' },
  { id: 'single', label: 'Centre stripe' },
  { id: 'twin', label: 'Twin rally' },
];

export const STATUSES = [
  { id: 'inquiry', label: 'Request', public: 'Request received', blurb: 'We have your build and we are reviewing it.' },
  { id: 'quoted', label: 'Quoted', public: 'Quote sent', blurb: 'Your final quote is ready. Check your inbox or WhatsApp.' },
  { id: 'booked', label: 'Booked', public: 'Booked in', blurb: 'Deposit received. Your bay is reserved and your film is on order.' },
  { id: 'in_bay', label: 'In bay', public: 'In the bay', blurb: 'Decon wash, disassembly and install in progress.' },
  { id: 'curing', label: 'Curing', public: 'Post-heat and cure', blurb: 'Edges post-heated. The film is settling for 24 hours.' },
  { id: 'ready', label: 'Ready', public: 'Ready for pickup', blurb: 'Final QC passed. Come and get it.' },
  { id: 'delivered', label: 'Delivered', public: 'Delivered', blurb: 'Enjoy it. Aftercare guide is in your glovebox.' },
];

export const DEFAULT_CONFIG = {
  model: 'mercedes-g63',
  year: '',
  zones: { body: '3m-satin-dark-grey', roof: null, hood: null, mirrors: null },
  stripes: 'none',
  stripeFilm: 'avy-pearl-white',
  wheels: 'gloss-black',
  calipers: 'orange',
  tint: 2,
  chromeDelete: true,
  ppf: 'none',
  ppfFinish: 'gloss',
  ceramic: false,
  plate: 'KDL 254W',
  env: 'studio',
};

export function normalizeConfig(input) {
  const i = input || {};
  const c = { ...DEFAULT_CONFIG, ...i };
  c.zones = { ...DEFAULT_CONFIG.zones, ...(i.zones || {}) };
  if (!MODELS.find((m) => m.id === c.model)) c.model = DEFAULT_CONFIG.model;
  c.year = String(c.year || '').replace(/[^0-9]/g, '').slice(0, 4);
  if (!STRIPES.find((s) => s.id === c.stripes)) c.stripes = 'none';
  if (!WHEELS.find((w) => w.id === c.wheels)) c.wheels = 'stock';
  if (!CALIPERS.find((w) => w.id === c.calipers)) c.calipers = 'stock';
  c.tint = Math.max(0, Math.min(4, Number(c.tint) || 0));
  if (!['none', 'front', 'full'].includes(c.ppf)) c.ppf = 'none';
  if (!['gloss', 'stealth'].includes(c.ppfFinish)) c.ppfFinish = 'gloss';
  c.chromeDelete = !!c.chromeDelete;
  c.ceramic = !!c.ceramic;
  c.plate = String(c.plate || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 8);
  if (!['studio', 'dusk', 'night'].includes(c.env)) c.env = 'studio';
  delete c.body;
  delete c.vehicle;
  return c;
}

export function vehicleLabel(config) {
  const m = modelById(config.model);
  return `${config.year ? config.year + ' ' : ''}${modelName(m)}`;
}

const round500 = (n) => Math.round(n / 500) * 500;

/**
 * Itemised estimate in KES.
 * @param {object} config normalized build config
 * @param {Record<string, any>} films films keyed by id (price = KES per sq ft)
 * @param {{ labourMultiplier?: number }} [settings]
 */
export function estimate(config, films, settings = {}) {
  const model = modelById(config.model);
  const v = CLASSES[model.shape];
  const lm = Number(settings.labourMultiplier) || 1;
  const lines = [];
  const body = films[config.zones.body];
  if (body) {
    const hard = body.finish === 'chrome' || body.finish === 'shift' ? 1.18 : 1;
    lines.push({ key: 'body', label: `Full colour change · ${body.name}`, amount: round500(v.sqft * body.price + v.labour * lm * hard) });
  }
  const contrast = (zone, label, sqft, labour) => {
    const id = config.zones[zone];
    if (!id || id === config.zones.body) return;
    const f = films[id];
    if (!f) return;
    lines.push({ key: zone, label: `${label} · ${f.name}`, amount: round500(sqft * f.price + labour * lm) });
  };
  contrast('roof', 'Contrast roof', v.roof, 8000);
  contrast('hood', 'Contrast bonnet', v.hood, 7000);
  contrast('mirrors', 'Mirror caps', 4, 3000);
  if (config.stripes !== 'none') {
    const f = films[config.stripeFilm];
    lines.push({ key: 'stripes', label: `${config.stripes === 'twin' ? 'Twin rally stripes' : 'Centre stripe'}${f ? ' · ' + f.name : ''}`, amount: round500(v.stripes * (config.stripes === 'twin' ? 1.3 : 1) * lm) });
  }
  const wheel = WHEELS.find((w) => w.id === config.wheels);
  if (wheel && wheel.price) lines.push({ key: 'wheels', label: `Rims · ${wheel.label}`, amount: wheel.price });
  const cal = CALIPERS.find((c) => c.id === config.calipers);
  if (cal && cal.price) lines.push({ key: 'calipers', label: `Calipers · ${cal.label}`, amount: cal.price });
  const tint = TINT[config.tint];
  if (tint && tint.price) lines.push({ key: 'tint', label: `Nano-ceramic tint · ${tint.vlt}`, amount: tint.price });
  if (config.chromeDelete) lines.push({ key: 'chrome', label: 'Chrome delete', amount: v.chromeDelete });
  if (config.ppf !== 'none') {
    const base = config.ppf === 'full' ? v.ppfFull : v.ppfFront;
    const stealth = config.ppfFinish === 'stealth' ? 1.12 : 1;
    lines.push({
      key: 'ppf',
      label: `${config.ppf === 'full' ? 'Full body' : 'Full front'} PPF · ${config.ppfFinish === 'stealth' ? 'Stealth matte' : 'Gloss'}`,
      amount: round500(base * stealth),
    });
  }
  if (config.ceramic) lines.push({ key: 'ceramic', label: 'Ceramic coating · 3yr', amount: v.ceramic });

  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { lines, total, low: round500(total * 0.93), high: round500(total * 1.07) };
}

export function money(n) {
  return `KES ${Math.round(n || 0).toLocaleString('en-KE')}`;
}
export function moneyShort(n) {
  const v = Math.round(n || 0);
  if (v >= 1_000_000) return `KES ${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1000) return `KES ${Math.round(v / 1000)}k`;
  return `KES ${v}`;
}
