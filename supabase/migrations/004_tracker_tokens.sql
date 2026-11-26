-- Tracker links carry a long random token. The short LW code alone shows only the stage, no personal details.
alter table public.jobs add column if not exists track_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists jobs_track_token_key on public.jobs (track_token);
