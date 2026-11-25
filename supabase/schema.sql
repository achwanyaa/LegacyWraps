-- Legacy Wraps schema. Applied by `npm run db:setup` (server/setup.js) via the Supabase Management API.
-- All tables have RLS enabled with no policies: only the server (service role) can read or write.

create table if not exists public.films (
  id text primary key,
  brand text not null,
  name text not null,
  finish text not null check (finish in ('gloss','satin','matte','metallic','shift','chrome','carbon')),
  hex text not null,
  hex2 text,
  price numeric(8,2) not null default 0,
  in_stock boolean not null default true,
  featured boolean not null default false,
  sort integer not null default 0
);

create table if not exists public.jobs (
  id bigint generated always as identity primary key,
  code text unique not null,
  status text not null default 'inquiry'
    check (status in ('inquiry','quoted','booked','in_bay','curing','ready','delivered')),
  customer_name text not null,
  email text not null,
  phone text,
  vehicle text,
  message text,
  preferred_date date,
  config jsonb not null,
  estimate integer not null default 0,
  final_price integer,
  scheduled_date date,
  bay integer,
  notes text,
  snapshot_path text,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_scheduled_idx on public.jobs (scheduled_date);

create table if not exists public.job_events (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.jobs(id) on delete cascade,
  status text,
  message text not null,
  public boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists job_events_job_idx on public.job_events (job_id, created_at);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null
);

alter table public.films enable row level security;
alter table public.jobs enable row level security;
alter table public.job_events enable row level security;
alter table public.settings enable row level security;

-- Public bucket for studio renders attached to quote requests.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('snapshots', 'snapshots', true, 3145728, array['image/webp','image/png','image/jpeg'])
on conflict (id) do nothing;
