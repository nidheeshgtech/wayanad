import { Box3, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, Vector3, type Object3D } from "three";
import { plainGeometry } from "@/lib/vehicleAssets";
import type { Wheels } from "@/data/cars";

/**
 * Wheels for a model whose file doesn't name them the way the game's own cars do (data/cars.ts `wheels`), so they roll:
 *   nodes   each node whose name matches is one wheel (as it is)
 *   split   each node whose name matches is an axle (both wheels in one part): cut in two, left and right
 *   cut     the wheels are baked into a part with other things (trim): every triangle of the parts named `from` within
 *           r of a wheel's axle (centres in the file's own units, as a tool such as gltf-transform reads them) and out
 *           past `inner` from the middle is cut out as that wheel
 * Returns the wheels as objects for PlayerCar to rig (each held where it is, under `into`, which must sit at the
 * model's frame: identity, unparented) and the meshes they leave behind in place of the ones they were cut from.
 */
export function modelWheels(model: Object3D, spec: Wheels, into: Group) {
  model.updateMatrixWorld(true); into.updateMatrixWorld(true);
  const inv = new Matrix4().copy(into.matrixWorld).invert();
  const units: Object3D[] = [], replaced = new Map<Mesh, Mesh | null>();
  const local = (m: Mesh) => { const g = plainGeometry(m.geometry, new Matrix4().multiplyMatrices(inv, m.matrixWorld)); return g.index ? g.toNonIndexed() : g; };
  // the triangles of `g` that pass `keep(centroid)`, as a new geometry
  const pick = (g: BufferGeometry, keep: (c: Vector3) => boolean) => {
    const out = new BufferGeometry(), names = Object.keys(g.attributes), take: number[] = [], c = new Vector3(), v = new Vector3(), p = g.getAttribute("position");
    for (let t = 0; t < p.count; t += 3) {
      c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(p, t + k)); c.multiplyScalar(1 / 3);
      if (keep(c)) take.push(t);
    }
    if (!take.length) return null;
    for (const n of names) {
      const a = g.getAttribute(n) as BufferAttribute, s = a.itemSize, f = new Float32Array(take.length * 3 * s);
      take.forEach((t, j) => f.set((a.array as Float32Array).subarray(t * s, (t + 3) * s), j * 3 * s));
      out.setAttribute(n, new BufferAttribute(f, s));
    }
    return out;
  };
  const meshOf = (g: BufferGeometry, from: Mesh) => { const m = new Mesh(g, from.material); m.name = from.name; m.castShadow = from.castShadow; m.receiveShadow = from.receiveShadow; return m; };
  const named = (re: RegExp) => { const out: Object3D[] = []; model.traverse((o) => { if (re.test(o.name) && !out.some((p) => isUnder(o, p))) out.push(o); }); return out; };

  if ("nodes" in spec) {
    for (const node of named(spec.nodes)) {
      if (!spec.split) { units.push(node); continue; }
      const sides = [new Group(), new Group()];
      node.traverse((o) => {
        const m = o as Mesh; if (!m.isMesh) return;
        const g = local(m);
        sides.forEach((side, k) => { const part = pick(g, (c) => (k ? c.x > 0 : c.x <= 0)); if (part) side.add(meshOf(part, m)); });
        replaced.set(m, null);
      });
      for (const s of sides) if (s.children.length) { into.add(s); units.push(s); }
    }
  } else {
    // the centres, in the model's frame now (the file's frame moved by the model's own scale and placing)
    const toLocal = new Matrix4().multiplyMatrices(inv, model.matrixWorld);
    const centres = spec.cut.at.flatMap(([z, y]) => [-1, 1].map((side) => ({ side, c: new Vector3(side * spec.cut.inner, y, z).applyMatrix4(toLocal) })));
    const r = new Vector3(0, spec.cut.r, 0).applyMatrix4(toLocal).distanceTo(new Vector3(0, 0, 0).applyMatrix4(toLocal));
    const innerX = Math.abs(centres[0].c.x - new Vector3(0, 0, 0).applyMatrix4(toLocal).x);
    const groups = centres.map(() => new Group());
    model.traverse((o) => {
      const m = o as Mesh; if (!m.isMesh || !spec.cut.from.test(m.name)) return;
      const g = local(m), which = (c: Vector3) => centres.findIndex(({ side, c: w }) => Math.sign(c.x) === Math.sign(w.x) && Math.abs(c.x) > innerX && Math.hypot(c.y - w.y, c.z - w.z) < r);
      centres.forEach((_, k) => { const part = pick(g, (c) => which(c) === k); if (part) groups[k].add(meshOf(part, m)); });
      const rest = pick(g, (c) => which(c) < 0);
      replaced.set(m, rest ? meshOf(rest, m) : null);
    });
    for (const gr of groups) if (gr.children.length) { into.add(gr); units.push(gr); }
  }
  // the rest stand in for what was cut, in the same frame as the wheels
  for (const m of replaced.values()) if (m) into.add(m);
  return { units, replaced };
}
const isUnder = (o: Object3D, p: Object3D) => { for (let q: Object3D | null = o.parent; q; q = q.parent) if (q === p) return true; return false; };
/** (the box of a wheel unit, in `into`'s frame) */
export const unitBox = (o: Object3D) => new Box3().setFromObject(o);
