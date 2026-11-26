// Applies supabase/schema.sql, then any new supabase/migrations/NNN_*.sql in order, via the Management API.
// Then syncs the jobs status rule with STATUSES in shared/catalog.js, seeds demo data if empty,
// and creates the first owner account from the old shared password.
// Usage: npm run db:setup            (schema + migrations + seed if empty)
//        npm run db:setup -- --reset (schema + migrations + wipe + reseed)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, need } from './env.js';
import { STATUSES } from '../shared/catalog.js';

const token = need('SUPABASE_ACCESS_TOKEN');
const ref = need('SUPABASE_PROJECT_REF');
async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

await query(fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
console.log('Schema applied.');

await query('create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now()); alter table public.schema_migrations enable row level security;');
const done = new Set((await query('select name from public.schema_migrations')).map((r) => r.name));
const dir = path.join(ROOT, 'supabase', 'migrations');
for (const file of fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : []) {
  if (done.has(file)) continue;
  await query(`begin;\n${fs.readFileSync(path.join(dir, file), 'utf8')}\ninsert into public.schema_migrations (name) values (${lit(file)});\ncommit;`);
  console.log('Migration applied:', file);
}

// One status list: the database rule is rebuilt from shared/catalog.js every run.
await query(
  `alter table public.jobs drop constraint if exists jobs_status_check;
   alter table public.jobs add constraint jobs_status_check check (status in (${STATUSES.map((s) => lit(s.id)).join(',')}));`,
);
console.log('Status rule synced:', STATUSES.map((s) => s.id).join(', '));

await query("notify pgrst, 'reload schema';"); // PostgREST caches the schema
await new Promise((r) => setTimeout(r, 2500));

const { seed, ensureOwner } = await import('./db.js');
const did = await seed({ force: process.argv.includes('--reset') });
console.log(did ? 'Seeded demo films, jobs and settings.' : 'Data already present, skipped seed (use --reset to wipe).');
const owner = await ensureOwner();
if (owner) console.log(`Created the owner account. Sign in with username "${owner}" and the existing admin password.`);
