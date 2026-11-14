import { BufferGeometry } from "three";

/**
 * A geometry of its own for one InstancedMesh, over the same vertex buffers as `g` (no copy, no extra GPU memory).
 * three keeps one vertex-array state per (geometry, shader): instanced meshes that share a geometry but have their own
 * instance buffers made it re-point every attribute on each draw (~8 GL calls a draw — the veg tiles alone were ~450
 * a frame), which on iPhones, where every GL call crosses to the GPU process, cost several ms. Own geometry → own state,
 * set up once.
 */
export function ownGeometry(g: BufferGeometry) {
  const out = new BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) out.setAttribute(name, a);
  out.index = g.index;
  for (const [name, list] of Object.entries(g.morphAttributes)) out.morphAttributes[name] = list;
  out.morphTargetsRelative = g.morphTargetsRelative;
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
  out.boundingBox = g.boundingBox?.clone() ?? null; out.boundingSphere = g.boundingSphere?.clone() ?? null;
  out.userData = g.userData;
  return out;
}
