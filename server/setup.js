// Applies supabase/schema.sql to the project via the Management API, then seeds demo data.
// Usage: npm run db:setup            (schema + seed if empty)
//        npm run db:setup -- --reset (schema + wipe + reseed)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, need } from './env.js';

const token = need('SUPABASE_ACCESS_TOKEN');
const ref = need('SUPABASE_PROJECT_REF');
const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
if (!res.ok) {
  console.error('Schema failed:', res.status, await res.text());
  process.exit(1);
}
console.log('Schema applied.');
// PostgREST caches the schema; give it a moment to pick up new tables.
await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "notify pgrst, 'reload schema';" }),
});
await new Promise((r) => setTimeout(r, 2500));

const { seed } = await import('./db.js');
const did = await seed({ force: process.argv.includes('--reset') });
console.log(did ? 'Seeded demo films, jobs and settings.' : 'Data already present, skipped seed (use --reset to wipe).');
console.log('Admin password: ' + (process.env.ADMIN_PASSWORD || 'legacy2026'));
