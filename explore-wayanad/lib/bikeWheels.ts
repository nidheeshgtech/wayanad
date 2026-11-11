/**
 * The bikes' wheels, cut out so they can turn. The bike models (public/models/traffic/enfield-real, pulsar-real) are a
 * few big meshes with the wheels baked in, nothing named "wheel". So: the tyres are what touches the ground, front
 * and back; each axle sits a wheel's radius above the middle of that contact; every triangle wholly inside that
 * wheel's disc (and no wider than a tyre) is a wheel's. Those go on a pivot at the axle; the rest stays the bike.
 * Works in the frame `into` (the drawn vehicle's root: wheels on y = 0, +z forward), `length` units long.
 */
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, Vector3, type Material, type Object3D } from "three";
import { plainGeometry } from "@/lib/vehicleAssets";

/** Wheel radius and the tyre's half-width, as fractions of the bike's length (an 18–19" wheel on a 2 m bike). */
const WHEEL = { radius: 0.155, half: 0.05, contact: 0.2 };

export function cutBikeWheels(meshes: Mesh[], into: Object3D, length: number) {
  into.updateMatrixWorld(true);
  const inv = new Matrix4().copy(into.matrixWorld).invert(), R = WHEEL.radius * length, half = WHEEL.half * length;
  // every mesh's triangles in `into`'s frame
  // (plain floats first: the files pack positions as quantised, interleaved numbers, which won't survive a transform)
  const parts = meshes.map((m) => {
    const p = plainGeometry(m.geometry, new Matrix4().multiplyMatrices(inv, m.matrixWorld));
    return { mesh: m, g: p.index ? p.toNonIndexed() : p };
  });
  // the contact patches: the lowest points, front and back
  let minY = Infinity;
  for (const { g } of parts) { const p = g.getAttribute("position"); for (let i = 0; i < p.count; i++) minY = Math.min(minY, p.getY(i)); }
  const ends = { front: { z: 0, n: 0 }, back: { z: 0, n: 0 } };
  for (const { g } of parts) {
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > minY + WHEEL.contact * R || Math.abs(p.getX(i)) > half) continue;
      const e = p.getZ(i) > 0 ? ends.front : ends.back; e.z += p.getZ(i); e.n++;
    }
  }
  if (!ends.front.n || !ends.back.n) return null;
  // each wheel's real size and centre, measured from its tyre: at about axle height the tyre is the only thing there
  // (between the fork legs or the swingarm), so its front and back edges give the diameter, and the middle the axle.
  // A guessed centre was off, and the wheel then carried the mudguard and number plate round with it
  const measure = (z0: number) => {
    let lo = Infinity, hi = -Infinity;
    for (const { g } of parts) {
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        // (the tyre's thin middle only: a wide chrome mudguard sits just outside it and would read as a bigger wheel)
        if (Math.abs(x) > half * 0.3 || Math.abs(y - (minY + R)) > 0.12 * R || Math.abs(z - z0) > 1.2 * R) continue;
        lo = Math.min(lo, z); hi = Math.max(hi, z);
      }
    }
    const r = hi > lo ? Math.min(1.08 * R, Math.max(0.75 * R, (hi - lo) / 2)) : R;
    return { at: new Vector3(0, minY + r, hi > lo ? (lo + hi) / 2 : z0), r };
  };
  const front = measure(ends.front.z / ends.front.n), back = measure(ends.back.z / ends.back.n);
  const axles = [{ ...front, front: true }, { ...back, front: false }];
  // split each mesh's triangles: wheel (inside one disc, tyre-wide) or body
  const wheels = axles.map((a) => ({ ...a, pieces: [] as { material: Material; g: BufferGeometry }[] }));
  const rest: Mesh[] = [];
  const v = new Vector3();
  // only what's wholly inside the tyre's own circle (a hair inside it), so nothing outside it turns
  const inDisc = (a: Vector3, r: number) => (v.y - a.y) ** 2 + (v.z - a.z) ** 2 < r * r * 0.95 && Math.abs(v.x) < half * 0.7;
  for (const { mesh, g } of parts) {
    const pos = g.getAttribute("position"), n = pos.count / 3;
    const which = new Int8Array(n).fill(-1);
    for (let t = 0; t < n; t++) {
      for (let w = 0; w < axles.length; w++) {
        let all = true;
        for (let k = 0; k < 3 && all; k++) { v.fromBufferAttribute(pos, t * 3 + k); all = inDisc(axles[w].at, axles[w].r); }
        if (all) { which[t] = w; break; }
      }
    }
    const pick = (keep: (t: number) => boolean, shift?: Vector3) => {
      const out = new BufferGeometry();
      for (const [name, attr] of Object.entries(g.attributes)) {
        const a = attr as BufferAttribute, size = a.itemSize, src = a.array as ArrayLike<number>, dst: number[] = [];
        for (let t = 0; t < n; t++) if (keep(t)) for (let k = 0; k < 3 * size; k++) dst.push(src[t * 3 * size + k]);
        out.setAttribute(name, new BufferAttribute(new Float32Array(dst), size, a.normalized));
      }
      if (shift) out.translate(-shift.x, -shift.y, -shift.z);
      return out.getAttribute("position").count ? out : null;
    };
    const body = pick((t) => which[t] < 0);
    if (body) { const m = new Mesh(body, mesh.material); m.name = mesh.name; m.castShadow = mesh.castShadow; into.add(m); rest.push(m); }
    wheels.forEach((w, i) => { const piece = pick((t) => which[t] === i, w.at); if (piece) w.pieces.push({ material: mesh.material as Material, g: piece }); });
  }
  into.updateMatrixWorld(true);
  // each wheel on a pivot at its axle (the front one steers about it), a spinner inside that rolls
  const built = wheels.filter((w) => w.pieces.length).map((w) => {
    const pivot = new Group(), spinner = new Group(); pivot.position.copy(w.at); pivot.add(spinner);
    for (const p of w.pieces) { const m = new Mesh(p.g, p.material); m.castShadow = true; spinner.add(m); }
    return { pivot, spinner, front: w.front };
  });
  return { rest, wheels: built };
}
