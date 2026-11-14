import { InstancedMesh, Matrix3, Matrix4, Object3D, Vector3, type BufferAttribute, type Material, type Mesh } from "three";
import { ownGeometry } from "@/lib/instancing";

/**
 * The player's four wheels drawn as one instanced draw per material instead of one per wheel per material (the
 * default car's wheels are 7 materials each: 28 draws → 7). Only when the four are copies of one wheel: each wheel's
 * merged parts (lib/vehicleAssets mergeInto, in its spinner's frame) are matched to the first wheel's by material and
 * vertex count, and the transform from the first wheel's shape to each other's is solved from four of its vertices and
 * checked on all of them; anything else (a model with different front and rear wheels, a bike) keeps its own meshes.
 *
 * Mirrored copies (left wheels made by flipping the right ones) go in a second set whose holder is itself mirrored,
 * so each instance's own transform keeps a positive determinant and three's face culling stays right (over its own
 * geometry object: lib/instancing).
 *
 * `update()` after the pivots and spinners have turned: puts each instance where its wheel is now.
 */
type Wheel = { pivot: Object3D; spinner: Object3D };
export function instanceWheels(wheels: Wheel[], root: Object3D) {
  if (wheels.length < 2) return null;
  const parts = wheels.map((w) => w.spinner.children.filter((c) => (c as Mesh).isMesh) as Mesh[]);
  const first = parts[0];
  if (!first.length || parts.some((p) => p.length !== first.length || p.length !== p[0].parent!.children.length)) return null;
  for (const p of parts) for (let k = 0; k < first.length; k++) {
    if (p[k].material !== first[k].material || p[k].geometry.getAttribute("position").count !== first[k].geometry.getAttribute("position").count) return null;
  }
  // the transform taking wheel 0's shape onto wheel i's, from four well-spread vertices of the biggest part
  const big = first.reduce((a, b) => (b.geometry.getAttribute("position").count > a.geometry.getAttribute("position").count ? b : a));
  const bigK = first.indexOf(big), pos0 = big.geometry.getAttribute("position") as BufferAttribute, n = pos0.count;
  const v = (a: BufferAttribute, i: number) => new Vector3().fromBufferAttribute(a, i);
  const spread = [0];
  { let best = 0, bi = 0; for (let i = 0; i < n; i++) { const d = v(pos0, i).distanceToSquared(v(pos0, 0)); if (d > best) { best = d; bi = i; } } spread.push(bi); }
  { const a = v(pos0, spread[0]), ab = v(pos0, spread[1]).sub(a); let best = 0, bi = 0;
    for (let i = 0; i < n; i++) { const d = v(pos0, i).sub(a).cross(ab).lengthSq(); if (d > best) { best = d; bi = i; } } spread.push(bi); }
  { const a = v(pos0, spread[0]), nrm = v(pos0, spread[1]).sub(a).cross(v(pos0, spread[2]).sub(a)).normalize(); let best = 0, bi = 0;
    for (let i = 0; i < n; i++) { const d = Math.abs(v(pos0, i).sub(a).dot(nrm)); if (d > best) { best = d; bi = i; } } spread.push(bi); }
  const basis = (a: BufferAttribute) => { const o = v(a, spread[0]); return { o, m: new Matrix3().set(...cols(v(a, spread[1]).sub(o), v(a, spread[2]).sub(o), v(a, spread[3]).sub(o))) }; };
  const b0 = basis(pos0);
  if (Math.abs(b0.m.determinant()) < 1e-12) return null;
  const inv0 = b0.m.clone().invert(), size = Math.sqrt(v(pos0, spread[0]).distanceToSquared(v(pos0, spread[1]))) || 1;
  const shapes: Matrix4[] = [];
  for (const p of parts) {
    const bi = basis(p[bigK].geometry.getAttribute("position") as BufferAttribute), lin = bi.m.clone().multiply(inv0);
    const e = lin.elements, t = new Matrix4().set(e[0], e[3], e[6], 0, e[1], e[4], e[7], 0, e[2], e[5], e[8], 0, 0, 0, 0, 1);
    t.premultiply(new Matrix4().makeTranslation(bi.o.x, bi.o.y, bi.o.z)).multiply(new Matrix4().makeTranslation(-b0.o.x, -b0.o.y, -b0.o.z));
    // check: every part, every (strided) vertex
    for (let k = 0; k < first.length; k++) {
      const a = first[k].geometry.getAttribute("position") as BufferAttribute, b = p[k].geometry.getAttribute("position") as BufferAttribute;
      for (let i = 0; i < a.count; i += Math.max(1, a.count >> 6)) if (v(a, i).applyMatrix4(t).distanceTo(v(b, i)) > size * 1e-3) return null;
    }
    shapes.push(t);
  }
  // two sets: as modelled, and mirrored (held in a mirrored holder)
  const mirror = new Matrix4().makeScale(-1, 1, 1);
  const sets = [false, true].map((flip) => {
    const members = shapes.map((t, i) => ({ t, i })).filter(({ t }) => (t.determinant() < 0) === flip);
    if (!members.length) return null;
    const holder = new Object3D(); if (flip) holder.scale.x = -1; root.add(holder);
    const meshes = first.map((m) => {
      const im = new InstancedMesh(flip ? ownGeometry(m.geometry) : m.geometry, m.material as Material | Material[], members.length);
      im.castShadow = m.castShadow; im.receiveShadow = m.receiveShadow; im.name = m.name; im.frustumCulled = false;
      holder.add(im); return im;
    });
    return { members, meshes, flip };
  }).filter((s) => s !== null);
  for (const p of parts) for (const m of p) m.removeFromParent();
  const w = new Matrix4(), out = new Matrix4();
  const update = () => {
    for (const s of sets) s.members.forEach(({ t, i }, slot) => {
      const wh = wheels[i]; wh.pivot.updateMatrix(); wh.spinner.updateMatrix();
      w.multiplyMatrices(wh.pivot.matrix, wh.spinner.matrix).multiply(t);
      if (s.flip) w.premultiply(mirror);
      for (const im of s.meshes) { out.copy(w); im.setMatrixAt(slot, out); }
    });
    for (const s of sets) for (const im of s.meshes) im.instanceMatrix.needsUpdate = true;
  };
  update();
  return { update };
}

function cols(a: Vector3, b: Vector3, c: Vector3): [number, number, number, number, number, number, number, number, number] {
  return [a.x, b.x, c.x, a.y, b.y, c.y, a.z, b.z, c.z];
}
