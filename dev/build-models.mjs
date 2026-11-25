// Turns raw downloaded car models (models-src/*.glb) into phone-friendly, wrap-ready GLBs in public/models/.
// For each car: strip junk, merge parts into named wrap zones (LW_paint, LW_hood, LW_roof, LW_glass, LW_rims, LW_trim),
// orient front to +X at real-world length, simplify, compress textures to WebP and geometry with meshopt.
// Usage: node dev/build-models.mjs [id ...]
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, simplify, prune, textureCompress, quantize, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { MODELS } from '../shared/catalog.js';

const near = (hex) => (m) => {
  const c = m.getBaseColorFactor();
  const h = [0, 1, 2].map((i) => Math.round(Math.pow(c[i], 1 / 2.2) * 255));
  const t = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return h.every((v, i) => Math.abs(v - t[i]) <= 3);
};

/** Per-model recipe. Roles are matched by exact material name, or a predicate. First matching role wins. */
const RECIPES = {
  'mercedes-g63': {
    front: '+z',
    roles: { paint: ['bodypaint'], rims: ['AMG_wheels_color'], glass: ['G-class_glass', 'G-class_glass.004', 'G-class_glass_tint'], trim: ['AMG_silver', 'radiator_silver'] },
  },
  'mercedes-gle-coupe': {
    front: '-x',
    remove: ['Wet_stone_floor_with_moss.'],
    roles: { paint: ['Material_2125660675'], rims: ['Material_2125663859'], glass: ['Material_2125660666'] },
  },
  'range-rover-sport': {
    front: '+x',
    roles: { paint: ['Car_Paint'], hood: ['Carbon'], glass: ['Glass'] },
  },
  'mazda-atenza': {
    front: '+z',
    remove: ['Material.005'],
    roles: { paint: ['Material.001'], glass: ['glasses_pivot_Glass__0'] },
  },
  'mazda-cx5': {
    front: '+z',
    roles: { paint: ['Paint_Color'] },
  },
  'toyota-prado': {
    front: '+z',
    roles: {
      hood: ['WorldGridMaterial.007'],
      roof: ['WorldGridMaterial.019'],
      rims: ['WorldGridMaterial.003'],
      paint: [near('#604b0b'), near('#604c0a')],
    },
  },
};

const TARGET_TRIS = 220_000;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const outDir = path.resolve('public/models');
fs.mkdirSync(outDir, { recursive: true });
const credits = JSON.parse(fs.readFileSync('models-src/credits.json', 'utf8'));
const manifestPath = path.resolve('shared/models3d.js');
const only = process.argv.slice(2);
const manifest = {};

function triCount(doc) {
  let t = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(t);
}

for (const [id, recipe] of Object.entries(RECIPES)) {
  const src = `models-src/${id}.glb`;
  if (!fs.existsSync(src)) continue;
  const spec = MODELS.find((m) => m.id === id);
  if (!spec) throw new Error(`${id} not in catalog MODELS`);
  if (only.length && !only.includes(id)) {
    const prev = fs.existsSync(manifestPath) ? (await import(`../shared/models3d.js?${Date.now()}`)).MODELS_3D?.[id] : null;
    if (prev) manifest[id] = prev;
    continue;
  }
  const doc = await io.read(src);
  const root = doc.getRoot();
  const before = triCount(doc);

  // 1. strip junk
  for (const mesh of root.listMeshes())
    for (const p of mesh.listPrimitives()) if (recipe.remove?.includes(p.getMaterial()?.getName())) p.dispose();

  // 2. canonical wrap-zone materials
  const roleMats = {};
  const found = new Set();
  const matchRole = (m) => {
    for (const [role, rules] of Object.entries(recipe.roles))
      if (rules.some((r) => (typeof r === 'function' ? r(m) : m.getName() === r))) return role;
    return null;
  };
  for (const mesh of root.listMeshes())
    for (const p of mesh.listPrimitives()) {
      const m = p.getMaterial();
      if (!m) continue;
      const role = matchRole(m);
      if (!role) continue;
      found.add(role);
      roleMats[role] ??= doc
        .createMaterial(`LW_${role}`)
        .setBaseColorFactor(role === 'glass' ? [0.02, 0.02, 0.03, 0.6] : [0.5, 0.5, 0.5, 1])
        .setAlphaMode(role === 'glass' ? 'BLEND' : 'OPAQUE')
        .setRoughnessFactor(0.3)
        .setMetallicFactor(role === 'rims' || role === 'trim' ? 1 : 0);
      p.setMaterial(roleMats[role]);
    }

  // 3. orient (front -> +X), ground at y=0, centre, real-world length
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const inner = doc.createNode('LW_orient');
  const outer = doc.createNode('LW_fit').addChild(inner);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    inner.addChild(child);
  }
  scene.addChild(outer);
  const yaw = { '+x': 0, '-x': Math.PI, '+z': Math.PI / 2, '-z': -Math.PI / 2 }[recipe.front];
  inner.setRotation([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]);
  let b = getBounds(scene);
  const len = b.max[0] - b.min[0];
  const s = spec.dims[0] / len;
  outer.setScale([s, s, s]);
  b = getBounds(scene);
  const t = outer.getTranslation();
  outer.setTranslation([t[0] - (b.min[0] + b.max[0]) / 2, t[1] - b.min[1], t[2] - (b.min[2] + b.max[2]) / 2]);

  // 4. optimise
  await doc.transform(dedup(), flatten(), join({ keepNamed: false }), weld(), prune());
  const mid = triCount(doc);
  const ratio = Math.min(1, TARGET_TRIS / mid);
  if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004, lockBorder: false }), prune());
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), quantize(), prune());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  const out = path.join(outDir, `${id}.glb`);
  await io.write(out, doc);
  const kb = Math.round(fs.statSync(out).size / 1024);
  const after = triCount(doc);
  const c = credits[id] || {};
  manifest[id] = { file: `/models/${id}.glb`, kb, tris: after, zones: [...found].sort(), credit: { title: c.title, author: c.author, license: c.license, url: c.url } };
  console.log(`${id}: ${before.toLocaleString()} -> ${after.toLocaleString()} tris, ${kb} KB, zones: ${[...found].join(', ')}`);
}

fs.writeFileSync(
  manifestPath,
  `// Generated by dev/build-models.mjs — real 3D car models available in the Studio.\nexport const MODELS_3D = ${JSON.stringify(manifest, null, 2)};\n`,
);
