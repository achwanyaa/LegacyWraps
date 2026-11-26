-- One customer per phone number (or email when there is no phone), lead source and follow-ups on jobs, and quotes.

-- Kenyan numbers to +2547XXXXXXXX; other numbers keep their digits with a leading +. Must match normPhone in shared/catalog.js.
create or replace function public.lw_norm_phone(p text) returns text language sql immutable as $$
  select case
    when d = '' then null
    when d ~ '^0[17][0-9]{8}$' then '+254' || substr(d, 2)
    when d ~ '^[17][0-9]{8}$' then '+254' || d
    else '+' || d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

create table if not exists public.customers (
  id bigint generated always as identity primary key,
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customers_phone_key on public.customers (phone) where phone is not null;
create unique index if not exists customers_email_key on public.customers (lower(email)) where phone is null and email is not null;

alter table public.jobs alter column email drop not null;
alter table public.jobs add column if not exists customer_id bigint references public.customers(id) on delete set null;
alter table public.jobs add column if not exists source text not null default 'studio'
  check (source in ('studio', 'website', 'instagram', 'whatsapp', 'call', 'walk_in', 'referral', 'other'));
alter table public.jobs add column if not exists source_detail text;
alter table public.jobs add column if not exists service text;
alter table public.jobs add column if not exists last_contact_at timestamptz;
alter table public.jobs add column if not exists next_follow_up_at timestamptz;
create index if not exists jobs_customer_idx on public.jobs (customer_id);

create table if not exists public.quotes (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.jobs(id) on delete cascade,
  amount integer not null,
  note text,
  snapshot jsonb not null,               -- estimate lines and the prices used, frozen when the quote was sent
  outcome text not null default 'open' check (outcome in ('open', 'won', 'lost')),
  lost_reason text,
  staff_id bigint references public.staff(id) on delete set null,
  sent_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists quotes_job_idx on public.quotes (job_id, sent_at);

alter table public.customers enable row level security;
alter table public.quotes enable row level security;

-- Backfill: normalise stored phones, make one customer per phone (else per email), link every job.
update public.jobs set phone = public.lw_norm_phone(phone) where phone is not null;
insert into public.customers (name, phone, email, created_at)
select distinct on (phone) customer_name, phone, email, created_at from public.jobs
where phone is not null order by phone, created_at desc
on conflict do nothing;
insert into public.customers (name, phone, email, created_at)
select distinct on (lower(email)) customer_name, null, email, created_at from public.jobs
where phone is null and email is not null order by lower(email), created_at desc
on conflict do nothing;
update public.jobs j set customer_id = c.id from public.customers c where j.customer_id is null and j.phone is not null and c.phone = j.phone;
update public.jobs j set customer_id = c.id from public.customers c
where j.customer_id is null and j.phone is null and c.phone is null and lower(c.email) = lower(j.email);
-- Jobs already past the request stage count as contacted.
update public.jobs set last_contact_at = updated_at where last_contact_at is null and status <> 'inquiry';
