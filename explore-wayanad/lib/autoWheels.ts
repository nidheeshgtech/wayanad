import { Box3, BufferAttribute, BufferGeometry, Group, Matrix3, Matrix4, Mesh, Quaternion, Vector3, type Object3D } from "three";
import { plainGeometry } from "@/lib/vehicleAssets";

/**
 * Wheels found in a model that doesn't name them (the showroom's new vehicles, app/cars/new), so they can roll.
 * The model must stand on y = 0 with its length along z (as the showroom places it). Every mesh near the ground is cut
 * into its connected pieces; a tyre is a piece that is round seen from the side, touches the ground and is narrower
 * than it is tall. Each tyre, and everything else inside its circle (rim, spokes, disc, nuts), is moved into a group
 * whose origin is the axle, so turning the group about x rolls the wheel. A tyre's roundness is measured too: how
 * many sides its tread has (a coarse low-poly tyre shows corners as it rolls).
 */
export type Wheel = { pivot: Group; radius: number; sides: number; front: boolean; /** how far its axle is off the car's side-to-side line, degrees */ tilt: number };

type Piece = { mesh: Mesh; tris: number[]; box: Box3 };

export function autoWheels(model: Object3D, { maxRadius = 0.25 }: { maxRadius?: number } = {}): Wheel[] {
  model.updateMatrixWorld(true);
  const toModel = new Matrix4().copy(model.matrixWorld).invert();
  const all = new Box3().setFromObject(model), size = all.getSize(new Vector3()), L = size.z, ground = all.min.y;
  const meshes: Mesh[] = [];
  model.traverse((o) => { const m = o as Mesh; if (m.isMesh && !Array.isArray(m.material)) meshes.push(m); });

  // the pieces of every mesh that reaches down near the ground (in the model's frame)
  const pieces: Piece[] = [], whole: Piece[] = [], local = new Map<Mesh, BufferGeometry>();
  for (const m of meshes) {
    const b = new Box3().setFromObject(m).applyMatrix4(toModel);
    if (b.min.y > ground + 0.45 * maxRadius * L * 2) continue;
    const g = plainGeometry(m.geometry, new Matrix4().multiplyMatrices(toModel, m.matrixWorld));
    local.set(m, g);
    const own = split(g, L * 1e-4);
    for (const p of own) pieces.push({ mesh: m, ...p });
    whole.push({ mesh: m, tris: own.flatMap((p) => p.tris), box: b });
    // one part holding several tyres (both of a bike's, or all four): its front and back halves, and its corners
    for (const byX of [false, true]) {
      const groups = new Map<string, Piece>();
      for (const p of own) {
        const pc = p.box.getCenter(new Vector3()), k = `${pc.z > 0}${byX ? pc.x > 0 : ""}`;
        const g = groups.get(k); if (g) { g.box.union(p.box); g.tris.push(...p.tris); } else groups.set(k, { mesh: m, tris: [...p.tris], box: p.box.clone() });
      }
      if (groups.size > 1) whole.push(...groups.values());
    }
  }

  // tyres: round from the side, on the ground, not wider than tall (a whole part, or a piece of one)
  const s = new Vector3(), c = new Vector3();
  const isTyre = ({ box }: Piece) => {
    box.getSize(s);
    return s.y > 0.06 * L && s.y < maxRadius * 2 * L && Math.abs(s.y - s.z) < 0.12 * s.y && s.x < 0.9 * s.y && box.min.y < ground + 0.05 * L;
  };
  // (single connected pieces first, biggest first; whole parts and their halves only where no piece makes a tyre — a
  // part's corner can hold the tyre and the arch liner above it, round enough to pass for a bigger wheel)
  const bySize = (a: Piece, b: Piece) => b.box.getSize(s).y - a.box.getSize(c).y;
  const tyres = [...pieces.filter(isTyre).sort(bySize), ...whole.filter(isTyre).sort(bySize)];
  // one per wheel: pieces of the same tyre (split at seams, or tread and sidewall apart) share a centre
  const wheels: { centre: Vector3; r: number; x0: number; x1: number; box: Box3 }[] = [];
  // (biggest first; a piece joins a wheel only if it shares its axle and isn't bigger than it — a round exhaust or
  // lamp beside a tyre would drag its middle off otherwise)
  for (const t of tyres) {
    t.box.getCenter(c); t.box.getSize(s);
    const w = wheels.find((w) => w.centre.distanceTo(c) < 0.3 * w.r && s.y <= 2.1 * w.r);
    if (w) w.box.union(t.box);
    else if (wheels.some((w) => w.centre.distanceTo(c) < 1.2 * w.r)) continue;
    else wheels.push({ centre: c.clone(), r: s.y / 2, x0: 0, x1: 0, box: t.box.clone() });
  }
  // each wheel's axle and size from all its tyre's pieces together (one piece may be only part of the ring)
  for (const w of wheels) {
    w.box.getCenter(w.centre); w.box.getSize(s);
    w.r = Math.max(s.y, s.z) / 2; w.x0 = w.box.min.x; w.x1 = w.box.max.x;
  }
  // only real wheels: the biggest, down on the floor (a round lamp, a brake disc alone, a spare on the roof aren't)
  const big = Math.max(0, ...wheels.map((w) => w.r)), floor = Math.min(...wheels.map((w) => w.box.min.y));
  for (let k = wheels.length - 1; k >= 0; k--) if (wheels[k].r < 0.7 * big || wheels[k].box.min.y > floor + 0.025 * L) wheels.splice(k, 1);
  if (!wheels.length) return [];

  // what's inside a wheel: between its tyre's sides (reaching in for the hub) and within its circle — measured from
  // each piece's middle, so a whole tyre ring counts (its box's corners stand out past the circle)
  const inside = new Map<Piece, number>(), cy = (b: Box3) => b.getCenter(c), off = (b: Box3, w: (typeof wheels)[number]) => Math.hypot(cy(b).y - w.centre.y, c.z - w.centre.z);
  for (const p of pieces) {
    p.box.getSize(s);
    const k = wheels.findIndex((w) => {
      // (a car's wheel reaches in for its hub, not out; a bike's, in the middle, both ways: its hub is wider than its tyre)
      // (and out past the tyre a little: a dished rim, a hub cap stands proud of it)
      const mid = Math.abs(w.centre.x) < 0.02 * L, inner = 0.45 * w.r, outer = 0.3 * w.r;
      const inX = p.box.min.x >= Math.min(w.x0, w.x1) - (mid || w.centre.x > 0 ? inner : outer) - 0.02 * L && p.box.max.x <= Math.max(w.x0, w.x1) + (mid || w.centre.x < 0 ? inner : outer) + 0.02 * L;
      return inX && off(p.box, w) + Math.max(s.y, s.z) / 2 < w.r * 1.06 + 0.002 * L;
    });
    if (k >= 0) inside.set(p, k);
  }
  // of those, only what turns: what is round and centred on the axle (tyre, rim, disc, hub), and parts set evenly all
  // the way round it (spokes, nuts, bolts). A brake caliper, a fork leg, a chain, a swing-arm sit to one side: they stay.
  const owner = new Map<Piece, number>();
  const centred = (b: Box3, w: (typeof wheels)[number]) => { b.getSize(s); return off(b, w) < 0.1 * w.r && Math.abs(s.y - s.z) < 0.15 * Math.max(s.y, s.z); };
  for (const m of local.keys()) wheels.forEach((w, k) => {
    const mine = pieces.filter((p) => p.mesh === m && inside.get(p) === k);
    const round = mine.filter((p) => centred(p.box, w)), aside = mine.filter((p) => !centred(p.box, w));
    for (const p of round) owner.set(p, k);
    // the rest only as sets of the same part repeated round the axle (spokes, nuts, bolts, the halves of a rim): a
    // caliper, a fork leg, a mudguard stay are one of a kind, to one side — they stay put
    const size = (p: Piece) => p.box.getSize(s).length(), sets: Piece[][] = [];
    for (const p of aside) {
      const z = size(p), set = sets.find((q) => Math.abs(size(q[0]) - z) < 0.12 * z && Math.abs(q[0].tris.length - p.tris.length) <= Math.max(2, 0.1 * p.tris.length));
      if (set) set.push(p); else sets.push([p]);
    }
    for (const set of sets) {
      if (set.length < 2) continue;
      const together = centred(set.reduce((b, p) => b.union(p.box), new Box3()), w);
      const at = set.map((p) => { cy(p.box); return Math.atan2(c.y - w.centre.y, c.z - w.centre.z); }).sort((a, b) => a - b);
      let gap = at[0] + 2 * Math.PI - at[at.length - 1];
      for (let i = 1; i < at.length; i++) gap = Math.max(gap, at[i] - at[i - 1]);
      if (set.length >= 3 && (together || gap < Math.min(2.3, (3 * Math.PI) / set.length))) for (const p of set) owner.set(p, k);
    }
  });

  // a car's rim joined into a big part (the frame, the body): from that part, the triangles in the wheel's rim ring —
  // between the hub and the tyre, within the tyre's width. (Not a bike's: its swing-arm runs through that ring.)
  const extra = new Map<Mesh, Map<number, number[]>>(), tv = new Vector3();
  // (only for a wheel that came out clearly short of its twin across the axle — the twin's rim is a part of its own)
  const count = wheels.map((_, k) => [...owner].filter(([, o]) => o === k).reduce((n, [p]) => n + p.tris.length, 0));
  wheels.forEach((w, k) => {
    if (Math.abs(w.centre.x) < 0.02 * L) return;
    const twin = wheels.findIndex((v, j) => j !== k && Math.abs(v.centre.z - w.centre.z) < 0.5 * w.r && Math.sign(v.centre.x) !== Math.sign(w.centre.x));
    if (twin < 0 || count[k] > 0.75 * count[twin]) return;
    const out = 0.3 * w.r;
    for (const [m, g] of local) for (const p of pieces) {
      if (p.mesh !== m || owner.has(p)) continue;
      p.box.getSize(s); if (Math.max(s.y, s.z) < 1.5 * w.r || !p.box.intersectsBox(w.box)) continue;
      const pos = g.getAttribute("position"), ix = g.index, got: number[] = [];
      for (const t of p.tris) {
        let all = true;
        for (let q = 0; q < 3 && all; q++) {
          tv.fromBufferAttribute(pos, ix ? ix.getX(t * 3 + q) : t * 3 + q);
          const rad = Math.hypot(tv.y - w.centre.y, tv.z - w.centre.z);
          all = rad > 0.12 * w.r && rad < 0.95 * w.r && tv.x > Math.min(w.x0, w.x1) - out && tv.x < Math.max(w.x0, w.x1) + out;
        }
        if (all) got.push(t);
      }
      if (got.length > 24) { const e = extra.get(m) ?? new Map<number, number[]>(); e.set(k, [...(e.get(k) ?? []), ...got]); extra.set(m, e); }
    }
  });

  // each wheel's own axle: the direction its turning parts are thinnest in (a front wheel can be modelled steered or
  // leaning — spun about the car's side-to-side line, it wobbles). Pointing to the car's left, so all roll forward.
  const axles = wheels.map((w, k) => {
    const v = new Vector3(), pts: Vector3[] = [], mean = new Vector3();
    for (const [m, g] of local) for (const p of pieces) {
      if (p.mesh !== m || owner.get(p) !== k || !centred(p.box, w)) continue;
      const pos = g.getAttribute("position"), ix = g.index;
      for (const t of p.tris) for (let q = 0; q < 3; q++) { v.fromBufferAttribute(pos, ix ? ix.getX(t * 3 + q) : t * 3 + q); pts.push(v.clone()); }
    }
    if (pts.length < 12) return new Vector3(1, 0, 0);
    for (const q of pts) mean.add(q); mean.multiplyScalar(1 / pts.length);
    const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const q of pts) { const d = [q.x - mean.x, q.y - mean.y, q.z - mean.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] += d[i] * d[j]; }
    const M = new Matrix3().fromArray(C).transpose();
    if (Math.abs(M.determinant()) < 1e-12) return new Vector3(1, 0, 0);
    const inv = M.clone().invert(); let a = new Vector3(1, 0, 0);
    for (let t = 0; t < 40; t++) a = a.applyMatrix3(inv).normalize();
    if (a.x < 0) a.negate();
    // how sure: a wheel is a disc — much thinner along its axle than across. Its spread along the axle against its
    // spread across (the mean of the other two): a wide, squat tyre reads near 1 and its axle can't be trusted.
    const along = a.clone().applyMatrix3(M).dot(a), across = (C[0] + C[4] + C[8] - along) / 2, sure = along < 0.45 * across;
    // (only a front wheel is steered — a model can come with them turned ~30° and more; a rear one stays square)
    return w.centre.z > 0 && sure && a.dot(new Vector3(1, 0, 0)) > Math.cos(0.8) ? a : new Vector3(1, 0, 0);
  });

  // cut them out: each mesh keeps the rest; each wheel gets its parts, in the model's frame, under its pivot
  // (each pivot turned so its x is the wheel's axle: spinning it about its own x rolls the wheel true)
  const turns = axles.map((a) => new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), a));
  const pivots = wheels.map((w, k) => { const g = new Group(); g.position.copy(w.centre); g.quaternion.copy(turns[k]); g.userData.base = turns[k].clone(); g.name = "wheel"; model.add(g); return g; });
  for (const [m, g] of local) {
    const mine = pieces.filter((p) => p.mesh === m && owner.has(p));
    if (!mine.length && !extra.has(m)) continue;
    const taken = new Set<number>();
    wheels.forEach((w, k) => {
      const tris = [...mine.filter((p) => owner.get(p) === k).flatMap((p) => p.tris), ...(extra.get(m)?.get(k) ?? [])];
      if (!tris.length) return;
      tris.forEach((t) => taken.add(t));
      const part = new Mesh(pick(g, tris), m.material); part.name = m.name;
      part.geometry.translate(-w.centre.x, -w.centre.y, -w.centre.z);
      part.geometry.applyQuaternion(turns[k].clone().invert());
      pivots[k].add(part);
    });
    // the rest stays where it was: back into the mesh's own frame
    const triCount = (g.index ? g.index.count : g.getAttribute("position").count) / 3;
    const rest: number[] = []; for (let t = 0; t < triCount; t++) if (!taken.has(t)) rest.push(t);
    const back = new Matrix4().multiplyMatrices(toModel, m.matrixWorld).invert();
    if (rest.length) { const r = pick(g, rest); r.applyMatrix4(back); m.geometry = r; } else m.visible = false;
  }
  return wheels.map((w, k) => ({ pivot: pivots[k], radius: w.r, sides: sidesOf(pivots[k], w.r), front: w.centre.z > 0, tilt: (Math.acos(Math.min(1, axles[k].x)) * 180) / Math.PI }));
}

/** The connected pieces of a geometry (vertices at the same place count as joined), as triangle lists with boxes. */
export function split(g: BufferGeometry, eps: number) {
  const p = g.getAttribute("position"), ix = g.index, n = ix ? ix.count : p.count, at = (i: number) => (ix ? ix.getX(i) : i);
  const id = new Int32Array(p.count), keys = new Map<string, number>();
  for (let v = 0; v < p.count; v++) {
    const k = `${Math.round(p.getX(v) / eps)},${Math.round(p.getY(v) / eps)},${Math.round(p.getZ(v) / eps)}`;
    let x = keys.get(k); if (x === undefined) { x = keys.size; keys.set(k, x); } id[v] = x;
  }
  const parent = new Int32Array(keys.size).map((_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < n; i += 3) { const a = find(id[at(i)]), b = find(id[at(i + 1)]), c = find(id[at(i + 2)]); parent[b] = a; parent[find(c)] = a; }
  const groups = new Map<number, { tris: number[]; box: Box3 }>(), v = new Vector3();
  for (let i = 0; i < n; i += 3) {
    const r = find(id[at(i)]); let gr = groups.get(r);
    if (!gr) { gr = { tris: [], box: new Box3() }; groups.set(r, gr); }
    gr.tris.push(i / 3);
    for (let k = 0; k < 3; k++) gr.box.expandByPoint(v.fromBufferAttribute(p, at(i + k)));
  }
  return [...groups.values()];
}

/** The triangles `tris` of `g`, as a geometry of their own (unindexed). */
function pick(g: BufferGeometry, tris: number[]) {
  const out = new BufferGeometry(), ix = g.index;
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as BufferAttribute, s = a.itemSize, f = new Float32Array(tris.length * 3 * s);
    tris.forEach((t, j) => { for (let k = 0; k < 3; k++) { const v = ix ? ix.getX(t * 3 + k) : t * 3 + k; for (let q = 0; q < s; q++) f[(j * 3 + k) * s + q] = a.getComponent(v, q); } });
    out.setAttribute(name, new BufferAttribute(f, s));
  }
  return out;
}

/** How many sides a tyre's tread has: the distinct angles of the points out at its rim, round the axle. */
function sidesOf(pivot: Group, r: number) {
  const angles = new Set<number>(), v = new Vector3();
  pivot.traverse((o) => {
    const m = o as Mesh; if (!m.isMesh) return; const p = m.geometry.getAttribute("position");
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (Math.hypot(v.y, v.z) > r * 0.9) angles.add(Math.round((Math.atan2(v.y, v.z) / (2 * Math.PI)) * 720)); }
  });
  return angles.size;
}
