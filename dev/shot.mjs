import { chromium } from 'playwright-core';
const [,, base, out, ...qs] = process.argv;
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text()); });
p.on('pageerror', e => console.log('[pageerror]', e.message));
let i = 0;
for (const q of qs) {
  await p.goto(base + q, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__ready === true || document.querySelector('[data-ready]'), null, { timeout: 60000 }).catch(() => console.log('not ready', q));
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}-${i++}.png` });
}
await b.close();
