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

export type StatusId = 'inquiry' | 'quoted' | 'booked' | 'in_bay' | 'curing' | 'ready' | 'delivered';

export interface Job {
  id: number;
  code: string;
  status: StatusId;
  customer_name: string;
  email: string;
  phone: string | null;
  vehicle: string | null;
  message: string | null;
  preferred_date: string | null;
  config: BuildConfig;
  estimate: number;
  final_price: number | null;
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
