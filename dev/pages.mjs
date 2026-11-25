// Screenshot app pages at desktop and phone sizes. Usage: node dev/pages.mjs outPrefix path1 path2 ...
import { chromium } from 'playwright-core';
const [, , out, ...paths] = process.argv;
const base = process.env.BASE || 'http://localhost:5180';
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [label, vp, mobile] of [['d', { width: 1440, height: 900 }, false], ['m', { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  if (process.env.LOGIN) await ctx.request.post(base + '/api/admin/login', { data: { password: process.env.LOGIN } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  p.on('console', (m) => m.type() === 'error' && !m.text().includes('GL Driver') && console.log('[console]', m.text()));
  let i = 0;
  for (const path of paths) {
    const full = path.endsWith('!');
    const url = base + path.replace(/!$/, '');
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.waitForTimeout(path.includes('studio') ? 12000 : 2500);
    await p.screenshot({ path: `${out}-${label}${i++}.png`, fullPage: full });
  }
  await ctx.close();
}
await b.close();
