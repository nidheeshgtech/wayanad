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
    const parts: { m: Mesh; g: BufferGeometry }[] = [];
    model.traverse((o) => { const m = o as Mesh; if (m.isMesh && spec.cut.from.test(m.name)) parts.push({ m, g: local(m) }); });
    // each wheel's true axle, from its tyre: the middle of the points within reach of the guess, out past `inner`,
    // taken again from there (the tyre is the outermost thing round the axle, so its extent settles the centre)
    const v = new Vector3();
    for (const w of centres) for (let pass = 0; pass < 4; pass++) {
      let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const { g } of parts) { const p = g.getAttribute("position");
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i);
          if (Math.sign(v.x) !== Math.sign(w.c.x) || Math.abs(v.x) < innerX || Math.hypot(v.y - w.c.y, v.z - w.c.z) > r) continue;
          y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); } }
      if (y0 < y1) w.c.set(w.c.x, (y0 + y1) / 2, (z0 + z1) / 2);
    }
    // a triangle is the wheel's when all its corners are inside the tyre (a long strip of trim reaching in isn't)
    const inside = (g: BufferGeometry, t: number) => {
      const p = g.getAttribute("position");
      for (let k = 0; k < centres.length; k++) {
        const { c: w } = centres[k]; let all = true;
        for (let q = 0; q < 3 && all; q++) { v.fromBufferAttribute(p, t + q); all = Math.sign(v.x) === Math.sign(w.x) && Math.abs(v.x) > innerX && Math.hypot(v.y - w.y, v.z - w.z) < r; }
        if (all) return k;
      }
      return -1;
    };
    for (const { m, g } of parts) {
      const owner = new Int8Array(g.getAttribute("position").count / 3);
      for (let t = 0; t < owner.length; t++) owner[t] = inside(g, t * 3);
      let n = 0; const byTri = (k: number) => (c: Vector3) => { void c; return owner[n++] === k; };
      centres.forEach((_, k) => { n = 0; const part = pick(g, byTri(k)); if (part) groups[k].add(meshOf(part, m)); });
      n = 0; const rest = pick(g, byTri(-1));
      replaced.set(m, rest ? meshOf(rest, m) : null);
    }
    // (each wheel turns about its own axle, at its own size: not the middle of the box of what was cut)
    groups.forEach((gr, k) => { if (!gr.children.length) return; gr.userData.centre = centres[k].c.clone(); gr.userData.radius = r; into.add(gr); units.push(gr); });
  }
  // the rest stand in for what was cut, in the same frame as the wheels
  for (const m of replaced.values()) if (m) into.add(m);
  return { units, replaced };
}
const isUnder = (o: Object3D, p: Object3D) => { for (let q: Object3D | null = o.parent; q; q = q.parent) if (q === p) return true; return false; };
/** (the box of a wheel unit, in `into`'s frame) */
export const unitBox = (o: Object3D) => new Box3().setFromObject(o);
