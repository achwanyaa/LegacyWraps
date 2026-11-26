-- Staff accounts with roles, a change trail, a shared rate-limit log, and lost-lead reasons.
create table if not exists public.staff (
  id bigint generated always as identity primary key,
  name text not null,
  login text unique not null,            -- lower-case username, email or phone
  password_hash text not null,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  staff_id bigint references public.staff(id) on delete set null,
  action text not null,                  -- create | update | delete | login
  entity text not null,                  -- job | film | settings | staff | payment | price_list
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id, created_at);

-- Rate limiting that works across serverless instances.
create table if not exists public.rate_hits (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists rate_hits_key_idx on public.rate_hits (key, at);

alter table public.job_events add column if not exists staff_id bigint references public.staff(id) on delete set null;
alter table public.jobs add column if not exists lost_reason text;

alter table public.staff enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_hits enable row level security;
