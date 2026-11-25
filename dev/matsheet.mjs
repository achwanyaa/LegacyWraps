// node dev/matsheet.mjs <model-id> <outdir> [count] [view]  -> contact sheet highlighting each material
import { chromium } from 'playwright-core';
const [, , id, outDir, count = '12', view = 'q'] = process.argv;
const base = process.env.LAB || 'http://localhost:5181';
const b = await chromium.launch({ channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`${base}/dev/modellab.html?src=/${process.env.DIR || 'models-src'}/${id}.glb&hide=${process.env.HIDE || ''}`, { waitUntil: 'load' });
await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
const info = await p.evaluate(() => ({ info: window.info, materials: window.materials }));
console.log(id, JSON.stringify(info.info));
const shots = [];
await p.evaluate((v) => window.show(null, 'original', v), view);
shots.push(await p.screenshot({ type: 'jpeg', quality: 70 }));
for (const [name, t] of info.materials.slice(0, Number(count))) {
  await p.evaluate(([n, l, v]) => window.show([n], l, v), [name, `${name} (${Math.round(t / 1000)}k)`, view]);
  shots.push(await p.screenshot({ type: 'jpeg', quality: 70 }));
}
const p2 = await b.newPage({ viewport: { width: 1440, height: 400 } });
await p2.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(4,1fr);background:#000">${shots.map((s) => `<img style="width:100%;display:block" src="data:image/jpeg;base64,${s.toString('base64')}">`).join('')}</body>`);
await p2.screenshot({ path: `${outDir}/mat-${id}-${view}.jpg`, fullPage: true, type: 'jpeg', quality: 75 });
await b.close();
