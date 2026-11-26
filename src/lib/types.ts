export type Finish = 'gloss' | 'satin' | 'matte' | 'metallic' | 'shift' | 'chrome' | 'carbon';

export interface Film {
  id: string;
  brand: string;
  name: string;
  finish: Finish;
  hex: string;
  hex2: string | null;
  price: number;
  in_stock: boolean;
  featured: boolean;
  sort: number;
}

export type Shape = 'hatch' | 'sedan' | 'wagon' | 'suv' | 'boxy' | 'pickup' | 'van';
export type EnvName = 'studio' | 'dusk' | 'night';

export interface VehicleModel {
  id: string;
  make: string;
  model: string;
  gen: string;
  shape: Shape;
  dims: number[];
  wheel: number;
}

export interface BuildConfig {
  model: string;
  year: string;
  zones: { body: string; roof: string | null; hood: string | null; mirrors: string | null };
  stripes: 'none' | 'single' | 'twin';
  stripeFilm: string;
  wheels: string;
  calipers: string;
  tint: number;
  chromeDelete: boolean;
  ppf: 'none' | 'front' | 'full';
  ppfFinish: 'gloss' | 'stealth';
  ceramic: boolean;
  plate: string;
  env: EnvName;
}

// Must match STATUSES in shared/catalog.js (the database rule is generated from that list by npm run db:setup).
export type StatusId = 'inquiry' | 'quoted' | 'booked' | 'in_bay' | 'curing' | 'ready' | 'delivered' | 'lost' | 'no_show';

export interface Job {
  id: number;
  code: string;
  status: StatusId;
  customer_name: string;
  email: string | null;
  phone: string | null;
  vehicle: string | null;
  message: string | null;
  preferred_date: string | null;
  config: BuildConfig;
  estimate: number;
  final_price: number | null;
  lost_reason?: string | null;
  customer_id?: number | null;
  source: LeadSource;
  source_detail: string | null;
  service: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  days?: number | null;
  track_token?: string;
  scheduled_date: string | null;
  bay: number | null;
  notes: string | null;
  snapshot_url: string | null;
  featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobEvent {
  id: number;
  job_id: number;
  status: StatusId | null;
  message: string;
  public: boolean;
  created_at: string;
  staff?: { name: string } | null;
}

export type LeadSource = 'studio' | 'website' | 'instagram' | 'whatsapp' | 'call' | 'walk_in' | 'referral' | 'other';

export interface Lead extends Job {
  needs_reply: boolean;
  overdue_reply: boolean;
  follow_up_due: boolean;
}

export interface Quote {
  id: number;
  job_id: number;
  amount: number;
  note: string | null;
  outcome: 'open' | 'won' | 'lost';
  lost_reason: string | null;
  sent_at: string;
  decided_at: string | null;
  staff?: { name: string } | null;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  jobs: number;
  open: number;
  spend: number;
  cars: string[];
  last_at: string;
}

export interface Settings {
  shopName: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  hours: string;
  bays: number;
  labourMultiplier: number;
  instagram: string;
}
