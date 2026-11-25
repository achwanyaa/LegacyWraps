// Downloads CC-licensed car models from Sketchfab (needs SKETCHFAB_TOKEN in .env.local) into models-src/.
import fs from 'node:fs';
import path from 'node:path';
import '../server/env.js';

export const SOURCES = {
  'mercedes-g63': 'e5e2a1d2238048a1a494b3df983c16bb',
  'mercedes-gle-coupe': 'ac4667c76f4e4e6c813ff3e72bc07ff8',
  'mazda-atenza': '24fb449e5f4243f49666ccf22d10c834',
  'mazda-cx5': 'ea176c6ebe814be3b06641bf038f8642',
  'toyota-lc300': '30b7566b8752430a97c770df0744f82c',
  'range-rover-sport': 'd1fe581b3baf4af89275e9aa9a1392e2',
  'toyota-prado': 'd314ebc5f7b94f4fb1ee98a207b0ce34',
};

const token = process.env.SKETCHFAB_TOKEN;
if (!token) throw new Error('SKETCHFAB_TOKEN missing in .env.local');
const H = { Authorization: `Token ${token}` };
const out = path.resolve('models-src');
fs.mkdirSync(out, { recursive: true });
const credits = fs.existsSync(path.join(out, 'credits.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'credits.json'), 'utf8')) : {};
const only = process.argv.slice(2);

for (const [id, uid] of Object.entries(SOURCES)) {
  if (only.length && !only.includes(id)) continue;
  const file = path.join(out, `${id}.glb`);
  const info = await (await fetch(`https://api.sketchfab.com/v3/models/${uid}`)).json();
  credits[id] = { title: info.name, author: info.user?.displayName || info.user?.username, authorUrl: info.user?.profileUrl, license: info.license?.label, licenseUrl: info.license?.url, url: info.viewerUrl };
  if (fs.existsSync(file)) {
    console.log(`${id}: already downloaded`);
    continue;
  }
  const dl = await (await fetch(`https://api.sketchfab.com/v3/models/${uid}/download`, { headers: H })).json();
  if (!dl.glb?.url) {
    console.log(`${id}: no glb (${JSON.stringify(dl).slice(0, 120)})`);
    continue;
  }
  const res = await fetch(dl.glb.url);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${id}: ${(fs.statSync(file).size / 1048576).toFixed(1)} MB — ${credits[id].license} by ${credits[id].author}`);
}
fs.writeFileSync(path.join(out, 'credits.json'), JSON.stringify(credits, null, 2));
