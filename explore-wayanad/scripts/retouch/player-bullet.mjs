// Run from a folder with @gltf-transform/core, /extensions, /functions and meshoptimizer installed:
//   node player-bullet.mjs <original.glb> <out.glb> [badge-texture.webp]
// (the texture: the original M_Bugatti texture with its two BUGATTI ovals painted out)
// Super GT: the maker's marks off — the raised EB on the tail (triangles in a box of the white trim), the red EB centre
// caps on the wheels; the BUGATTI ovals in the lamp texture (M_Bugatti) replaced. Writes back meshopt-compressed.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { prune, unpartition } from '@gltf-transform/functions';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [src, out] = process.argv.slice(2);
const doc = await io.read(src);
const BOX = [[-0.095, 0.705, -2.245], [0.065, 0.82, -2.155]];
const tm = (o, v, m) => { const x = v[0], y = v[1], z = v[2]; o[0] = m[0]*x+m[4]*y+m[8]*z+m[12]; o[1] = m[1]*x+m[5]*y+m[9]*z+m[13]; o[2] = m[2]*x+m[6]*y+m[10]*z+m[14]; };
let cut = 0;
for (const node of doc.getRoot().listNodes()) {
  const name = node.getName(), mesh = node.getMesh(); if (!mesh) continue;
  const mats = mesh.listPrimitives().map((p) => p.getMaterial()?.getName());
  if ((mats.includes('M_Metalic_Orange') && /^Object_(12|17|22|27)$/.test(name))) { node.setMesh(null); console.log('dropped', name, mats.join()); continue; }
  if (name !== 'Object_6') continue;
  const W = node.getWorldMatrix();
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices(), a = idx.getArray(), keep = [], v = [0, 0, 0], o = [0, 0, 0];
    const inside = (i) => { pos.getElement(i, v); tm(o, v, W); return o.every((x, k) => x >= BOX[0][k] && x <= BOX[1][k]); };
    for (let t = 0; t < a.length; t += 3) { if (inside(a[t]) && inside(a[t + 1]) && inside(a[t + 2])) { cut++; continue; } keep.push(a[t], a[t + 1], a[t + 2]); }
    idx.setArray(new (a.constructor)(keep));
  }
}
console.log('cut triangles', cut);
if (process.argv[4]) { const { readFileSync } = await import('node:fs');
  const m = doc.getRoot().listMaterials().find((x) => x.getName() === 'M_Bugatti'); m.getBaseColorTexture().setImage(new Uint8Array(readFileSync(process.argv[4]))).setMimeType('image/webp'); console.log('badge ovals painted out'); }
await doc.transform(prune());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(out, doc);
