/**
 * The traffic's wheels, cut out so they turn (cars, vans, jeeps, the auto, buses, the lorry; the bikes have their own,
 * lib/bikeWheels). Most of the models are a few big meshes with the wheels baked into the body, nothing named "wheel".
 * So, in the drawn vehicle's frame (wheels on y = 0, +z forward):
 *  - the tyres are what touches the ground: the lowest points, gathered into patches along each side (and down the
 *    middle for the auto's front wheel); a patch's length gives the axle's place, its width the tyre's (twin tyres on a
 *    bus or lorry are one patch);
 *  - each axle is a wheel's radius up (the real tyre's size for the vehicle, `radius`: the shapes alone don't say it
 *    reliably — arches, mud flaps and steps crowd the tyre);
 *  - every triangle wholly inside that wheel's disc, and across the patch's width, is the wheel's; the rest stays the body.
 * The cut is made once per model (and placement) and shared by every vehicle drawn from it.
 */
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, Vector3 } from "three";
import { plainGeometry } from "@/lib/vehicleAssets";

// (pieces name the part they came from, by its place in `meshes`: each vehicle draws them in its own materials — the
// traffic tints each car its own colour)
type Piece = { part: number; g: BufferGeometry };
type Cut = { rest: Piece[]; wheels: { at: Vector3; r: number; pieces: Piece[] }[] };
const cuts = new Map<string, Cut | null>();

function build(cut: Cut, into: Group, meshes: Mesh[]) {
  const rest = cut.rest.map((r) => { const m = new Mesh(r.g, meshes[r.part].material); m.name = meshes[r.part].name; into.add(m); return m; });
  const wheels = cut.wheels.map((w) => {
    const pivot = new Group(), spinner = new Group(); pivot.name = "wheel-pivot"; spinner.name = "wheel-spin";
    pivot.position.copy(w.at); pivot.add(spinner);
    for (const p of w.pieces) spinner.add(new Mesh(p.g, meshes[p.part].material));
    into.add(pivot);
    return { pivot, spinner, r: w.r };
  });
  return { rest, wheels };
}

/** `key`: the model and its placement (the same key, the same cut). `radius`: the tyre's, in the frame's units. */
export function cutCarWheels(meshes: Mesh[], into: Group, key: string, size: { width: number; height: number }, radius: number, centreWheel = false) {
  if (cuts.has(key)) { const c = cuts.get(key)!; return c ? build(c, into, meshes) : null; }
  into.updateMatrixWorld(true);
  const inv = new Matrix4().copy(into.matrixWorld).invert();
  const parts = meshes.map((m) => { const p = plainGeometry(m.geometry, new Matrix4().multiplyMatrices(inv, m.matrixWorld)); return { g: p.index ? p.toNonIndexed() : p }; });
  let minY = Infinity;
  for (const { g } of parts) { const p = g.getAttribute("position"); for (let i = 0; i < p.count; i++) minY = Math.min(minY, p.getY(i)); }
  // the contact patches: the lowest points, in lanes (left, right, and the middle for a three-wheeler's front wheel)
  const W = size.width, lanes: { pick: (x: number) => boolean }[] = [{ pick: (x) => x > W * 0.18 }, { pick: (x) => x < -W * 0.18 }];
  if (centreWheel) lanes.push({ pick: (x) => Math.abs(x) < W * 0.1 });
  const found: { z0: number; z1: number; x0: number; x1: number; n: number }[] = [];
  for (const lane of lanes) {
    const pts: [number, number][] = [];
    for (const { g } of parts) { const p = g.getAttribute("position"); for (let i = 0; i < p.count; i++) if (p.getY(i) < minY + 0.004 && lane.pick(p.getX(i))) pts.push([p.getZ(i), p.getX(i)]); }
    pts.sort((a, b) => a[0] - b[0]);
    let cur: (typeof found)[number] | null = null;
    for (const [z, x] of pts) {
      if (!cur || z - cur.z1 > radius * 0.6) { cur = { z0: z, z1: z, x0: x, x1: x, n: 0 }; found.push(cur); }
      cur.z1 = z; cur.x0 = Math.min(cur.x0, x); cur.x1 = Math.max(cur.x1, x); cur.n++;
    }
  }
  // (a real tyre's patch, not a mud flap's corner or a step's: a few points at least, and no longer than the tyre)
  const most = Math.max(0, ...found.map((f) => f.n));
  const axles = found.filter((f) => f.n >= Math.max(3, most * 0.15) && f.z1 - f.z0 < radius * 1.6);
  if (!axles.length) { cuts.set(key, null); return null; }
  const wheels = axles.map((f) => ({ at: new Vector3((f.x0 + f.x1) / 2, minY + radius, (f.z0 + f.z1) / 2), x0: f.x0 - 0.006, x1: f.x1 + 0.006, r: radius, pieces: [] as Piece[] }));
  const v = new Vector3(), inside = (w: (typeof wheels)[number]) => v.x > w.x0 && v.x < w.x1 && (v.y - w.at.y) ** 2 + (v.z - w.at.z) ** 2 < (w.r * 0.97) ** 2;
  const rest: Cut["rest"] = [];
  parts.forEach(({ g }, part) => {
    const pos = g.getAttribute("position"), n = pos.count / 3, which = new Int16Array(n).fill(-1);
    for (let t = 0; t < n; t++) for (let k = 0; k < wheels.length; k++) {
      let all = true; for (let q = 0; q < 3 && all; q++) { v.fromBufferAttribute(pos, t * 3 + q); all = inside(wheels[k]); }
      if (all) { which[t] = k; break; }
    }
    const pick = (keep: (t: number) => boolean, shift?: Vector3) => {
      const out = new BufferGeometry();
      for (const [name, attr] of Object.entries(g.attributes)) {
        const a = attr as BufferAttribute, s = a.itemSize, src = a.array as ArrayLike<number>, dst: number[] = [];
        for (let t = 0; t < n; t++) if (keep(t)) for (let k = 0; k < 3 * s; k++) dst.push(src[t * 3 * s + k]);
        out.setAttribute(name, new BufferAttribute(new Float32Array(dst), s, a.normalized));
      }
      if (shift) out.translate(-shift.x, -shift.y, -shift.z);
      return out.getAttribute("position").count ? out : null;
    };
    const body = pick((t) => which[t] < 0);
    if (body) rest.push({ g: body, part });
    wheels.forEach((w, k) => { const piece = pick((t) => which[t] === k, w.at); if (piece) w.pieces.push({ part, g: piece }); });
  });
  const cut: Cut = { rest, wheels: wheels.filter((w) => w.pieces.length).map((w) => ({ at: w.at.clone(), r: w.r, pieces: w.pieces })) };
  cuts.set(key, cut);
  return build(cut, into, meshes);
}
