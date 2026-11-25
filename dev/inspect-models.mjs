import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  let tris = 0;
  const matTris = new Map();
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices();
    const t = (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    tris += t;
    const m = p.getMaterial()?.getName() || '(none)';
    matTris.set(m, (matTris.get(m) || 0) + t);
  }
  const tex = root.listTextures();
  const texMB = tex.reduce((s, t) => s + (t.getImage()?.byteLength || 0), 0) / 1048576;
  console.log(`\n== ${f.split('/').pop()}  tris=${Math.round(tris).toLocaleString()} meshes=${root.listMeshes().length} materials=${root.listMaterials().length} textures=${tex.length} (${texMB.toFixed(1)}MB)`);
  const rows = [...matTris.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  ' + rows.map(([m, t]) => `${m}:${Math.round(t / 1000)}k`).join('  '));
}
