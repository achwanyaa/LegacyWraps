import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Locally we read .env.local; on Vercel the variables come from the project settings.
for (const f of ['.env.local', '.env']) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

export function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. Set it in .env.local or in Vercel project settings.`);
  return v;
}
