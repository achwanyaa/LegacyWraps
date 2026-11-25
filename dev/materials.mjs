import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [f, minK = '3'] = process.argv.slice(2);
const doc = await io.read(f);
const tri = new Map();
for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
  const idx = p.getIndices(); const t = (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  tri.set(p.getMaterial(), (tri.get(p.getMaterial()) || 0) + t);
}
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255).toString(16).padStart(2, '0')).join('');
for (const m of doc.getRoot().listMaterials().sort((a, b) => (tri.get(b) || 0) - (tri.get(a) || 0))) {
  const t = tri.get(m) || 0; if (t < Number(minK) * 1000) continue;
  const cc = m.getExtension('KHR_materials_clearcoat');
  console.log([m.getName().padEnd(34), (Math.round(t / 1000) + 'k').padStart(5), hex(m.getBaseColorFactor()), 'a=' + m.getBaseColorFactor()[3].toFixed(2), m.getAlphaMode(), 'met=' + m.getMetallicFactor().toFixed(2), 'rough=' + m.getRoughnessFactor().toFixed(2), m.getBaseColorTexture() ? 'TEX' : '', cc ? 'clearcoat' : ''].join(' '));
}
