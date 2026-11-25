// Pre-renders homepage hero stills and job thumbnails with the real 3D studio, in headless Edge/Chrome.
// Needs the dev server running (npm run dev). Usage: npm run renders [-- --jobs-only | --heroes-only | --all-jobs]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { ROOT } from '../server/env.js';
import { sb, must } from '../server/db.js';
import { HEROES } from '../shared/heroes.js';

const base = process.env.LAB_URL || 'http://localhost:5180';
const args = process.argv.slice(2);
const outDir = path.join(ROOT, 'public', 'renders');
fs.mkdirSync(outDir, { recursive: true });

const channel = process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chrome');
const browser = await chromium.launch({ channel, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`${base}/dev/carlab.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });

async function still(config, w, h, view = 'hero', zoom = 1) {
  await page.evaluate(([c, v, z]) => window.render(c, v, z), [config, view, zoom]);
  await page.waitForTimeout(400);
  const url = await page.evaluate(([w, h]) => window.snap(w, h), [w, h]);
  return Buffer.from(url.split(',')[1], 'base64');
}

if (!args.includes('--jobs-only')) {
  for (const h of HEROES) {
    for (const [suffix, w, hh] of [['', 1600, 900], ['-sm', 820, 520]]) {
      const buf = await still(h.config, w, hh, 'hero', suffix ? 0.8 : 0.74);
      fs.writeFileSync(path.join(outDir, `${h.id}${suffix}.webp`), buf);
      console.log(`hero ${h.id}${suffix}: ${(buf.length / 1024).toFixed(0)} KB`);
    }
  }
}

if (!args.includes('--heroes-only')) {
  let q = sb.from('jobs').select('id, code, config, snapshot_path');
  if (!args.includes('--all-jobs')) q = q.is('snapshot_path', null);
  const jobs = must(await q);
  for (const j of jobs) {
    const buf = await still(j.config, 960, 600, 'hero', 0.8);
    const key = `seed/${j.code}.webp`;
    const { error } = await sb.storage.from('snapshots').upload(key, buf, { contentType: 'image/webp', upsert: true });
    if (error) {
      console.error(j.code, error.message);
      continue;
    }
    must(await sb.from('jobs').update({ snapshot_path: key }).eq('id', j.id));
    console.log(`job ${j.code}: ${(buf.length / 1024).toFixed(0)} KB`);
  }
}

await browser.close();
