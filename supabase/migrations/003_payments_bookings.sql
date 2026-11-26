-- Payments against jobs, and bookings with a length so bays cannot be double-booked.
create table if not exists public.payments (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.jobs(id) on delete restrict,
  amount integer not null check (amount <> 0),          -- negative = refund
  method text not null check (method in ('cash', 'mpesa', 'bank', 'card')),
  reference text,
  kind text not null default 'payment' check (kind in ('deposit', 'payment', 'balance', 'refund')),
  paid_at timestamptz not null default now(),
  staff_id bigint references public.staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payments_job_idx on public.payments (job_id);
create index if not exists payments_paid_idx on public.payments (paid_at);
alter table public.payments enable row level security;

-- How many days the car holds its bay. Null = the default for its service.
alter table public.jobs add column if not exists days integer check (days between 1 and 30);
