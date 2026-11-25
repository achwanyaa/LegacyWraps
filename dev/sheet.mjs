// Usage: node dev/sheet.mjs out.png a.png b.png ... (3 columns)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const [, , out, ...imgs] = process.argv;
const url = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const b = await chromium.launch({ channel: 'msedge' });
const p = await b.newPage({ viewport: { width: 1500, height: 560 } });
await p.setContent(`<body style="margin:0;display:grid;grid-template-columns:1fr 1fr 1fr;background:#000">${imgs.map((i) => `<img style="width:100%;display:block" src="${url(i)}">`).join('')}</body>`);
await p.screenshot({ path: out, fullPage: true });
await b.close();
