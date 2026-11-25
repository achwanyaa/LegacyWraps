// Renders a car's spin layers with Blender on a Modal cloud GPU, then downloads them to models-src/spin-raw/<id>/.
// Needs MODAL_TOKEN_ID and MODAL_TOKEN_SECRET in .env.local (create a token at modal.com/settings/tokens).
// Usage: node render/spin.mjs <model-id> [--only 3,6] [--gpu A10G] [--samples 256] [--light 1]
// Then:  node dev/pack-spin.mjs <model-id>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ModalClient } from 'modal';
import { MODELS } from '../shared/catalog.js';

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const [id, ...rest] = process.argv.slice(2);
const opt = (name, def) => (rest.includes(`--${name}`) ? rest[rest.indexOf(`--${name}`) + 1] : def);
const spec = MODELS.find((m) => m.id === id);
const recipe = JSON.parse(fs.readFileSync('dev/recipes.json', 'utf8'))[id];
const glb = `models-src/${id}.glb`;
if (!spec || !recipe || !fs.existsSync(glb)) throw new Error(`Need a catalog entry, a dev/recipes.json entry and ${glb} for "${id}"`);
if (!process.env.MODAL_TOKEN_ID || !process.env.MODAL_TOKEN_SECRET) throw new Error('Set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET in .env.local');

const BLENDER = '4.2.3';
const modal = new ModalClient();
const app = await modal.apps.fromName('legacy-wraps-render', { createIfMissing: true });
const image = modal.images.fromRegistry('nvidia/cuda:12.4.1-runtime-ubuntu22.04').dockerfileCommands([
  'RUN apt-get update && apt-get install -y --no-install-recommends curl xz-utils ca-certificates libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 libice6 libgl1 libegl1 && rm -rf /var/lib/apt/lists/*',
  `RUN curl -fsSL https://download.blender.org/release/Blender${BLENDER.slice(0, 3)}/blender-${BLENDER}-linux-x64.tar.xz | tar -xJ -C /opt && mv /opt/blender-${BLENDER}-linux-x64 /opt/blender`,
  // CC0 studio lighting from Poly Haven
  'RUN curl -fsSL -o /opt/studio.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/studio_small_09_2k.hdr',
]);

const started = Date.now();
console.log('Starting GPU sandbox (the first run also builds the Blender image, a few minutes)...');
const sb = await modal.sandboxes.create(app, image, { gpu: opt('gpu', 'A10G'), timeoutMs: 90 * 60_000 });
try {
  const tmpRecipe = path.join(os.tmpdir(), `lw-recipe-${id}.json`);
  fs.writeFileSync(tmpRecipe, JSON.stringify(recipe));
  await sb.filesystem.copyFromLocal(glb, '/work/car.glb');
  await sb.filesystem.copyFromLocal('render/scene.py', '/work/scene.py');
  await sb.filesystem.copyFromLocal(tmpRecipe, '/work/recipe.json');
  console.log(`Uploaded ${id}. Rendering...`);

  const args = ['--glb', '/work/car.glb', '--recipe', '/work/recipe.json', '--dims', spec.dims.slice(0, 3).join(','), '--out', '/work/out'];
  for (const k of ['only', 'samples', 'light', 'frames']) if (opt(k)) args.push(`--${k}`, opt(k));
  const p = await sb.exec(['sh', '-c', `/opt/blender/blender -b -P /work/scene.py -- ${args.join(' ')} 2>&1`], { stdout: 'pipe', stderr: 'ignore' });
  let tail = [];
  let buf = '';
  for await (const chunk of p.stdout) {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      tail = [...tail.slice(-40), line];
      if (line.startsWith('LW ') || /Error|Traceback/.test(line)) console.log(line);
    }
  }
  const code = await p.wait();
  if (code !== 0) throw new Error(`Blender exited ${code}\n${tail.join('\n')}`);

  const tar = await sb.exec(['tar', '-cf', '/work/out.tar', '-C', '/work/out', '.']);
  if ((await tar.wait()) !== 0) throw new Error('tar failed');
  const dest = path.resolve(`models-src/spin-raw/${id}`);
  fs.mkdirSync(dest, { recursive: true });
  const localTar = path.join(dest, '_out.tar');
  await sb.filesystem.copyToLocal('/work/out.tar', localTar);
  execFileSync('tar', ['-xf', '_out.tar'], { cwd: dest });
  fs.rmSync(localTar);
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s -> ${dest}`);
} finally {
  await sb.terminate();
}
