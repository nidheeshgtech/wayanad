import { Box3, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, Vector3, type Object3D } from "three";
import { plainGeometry } from "@/lib/vehicleAssets";

/**
 * Wheels found in a model that doesn't name them (the showroom's new vehicles, app/cars/new), so they can roll.
 * The model must stand on y = 0 with its length along z (as the showroom places it). Every mesh near the ground is cut
 * into its connected pieces; a tyre is a piece that is round seen from the side, touches the ground and is narrower
 * than it is tall. Each tyre, and everything else inside its circle (rim, spokes, disc, nuts), is moved into a group
 * whose origin is the axle, so turning the group about x rolls the wheel. A tyre's roundness is measured too: how
 * many sides its tread has (a coarse low-poly tyre shows corners as it rolls).
 */
export type Wheel = { pivot: Group; radius: number; sides: number; front: boolean };

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
  const tyres = [...whole, ...pieces].filter(({ box }) => {
    box.getSize(s);
    return s.y > 0.06 * L && s.y < maxRadius * 2 * L && Math.abs(s.y - s.z) < 0.12 * s.y && s.x < 0.9 * s.y && box.min.y < ground + 0.05 * L;
  });
  // one per wheel: pieces of the same tyre (split at seams, or tread and sidewall apart) share a centre
  const wheels: { centre: Vector3; r: number; x0: number; x1: number; box: Box3 }[] = [];
  for (const t of tyres) {
    t.box.getCenter(c); t.box.getSize(s);
    const w = wheels.find((w) => w.centre.distanceTo(c) < 0.8 * Math.max(w.r, s.y / 2));
    if (w) w.box.union(t.box);
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

  // everything inside a wheel's circle and between its tyre's sides (reaching in a little for the hub) turns with it
  const owner = new Map<Piece, number>();
  for (const p of pieces) {
    p.box.getCenter(c); p.box.getSize(s);
    const k = wheels.findIndex((w) => {
      const inX = p.box.min.x >= Math.min(w.x0, w.x1) - 0.45 * w.r * (w.centre.x > 0 ? 1 : 0) - 0.02 * L && p.box.max.x <= Math.max(w.x0, w.x1) + 0.45 * w.r * (w.centre.x < 0 ? 1 : 0) + 0.02 * L;
      const reach = Math.max(Math.hypot(p.box.max.y - w.centre.y, p.box.max.z - w.centre.z), Math.hypot(p.box.min.y - w.centre.y, p.box.min.z - w.centre.z),
        Math.hypot(p.box.max.y - w.centre.y, p.box.min.z - w.centre.z), Math.hypot(p.box.min.y - w.centre.y, p.box.max.z - w.centre.z));
      return inX && reach < w.r * 1.06 + 0.002 * L;
    });
    if (k >= 0) owner.set(p, k);
  }

  // cut them out: each mesh keeps the rest; each wheel gets its parts, in the model's frame, under its pivot
  const pivots = wheels.map((w) => { const g = new Group(); g.position.copy(w.centre); g.name = "wheel"; model.add(g); return g; });
  for (const [m, g] of local) {
    const mine = pieces.filter((p) => p.mesh === m && owner.has(p));
    if (!mine.length) continue;
    const taken = new Set<number>();
    wheels.forEach((w, k) => {
      const tris = mine.filter((p) => owner.get(p) === k).flatMap((p) => p.tris);
      if (!tris.length) return;
      tris.forEach((t) => taken.add(t));
      const part = new Mesh(pick(g, tris), m.material); part.name = m.name;
      part.geometry.translate(-w.centre.x, -w.centre.y, -w.centre.z);
      pivots[k].add(part);
    });
    // the rest stays where it was: back into the mesh's own frame
    const triCount = (g.index ? g.index.count : g.getAttribute("position").count) / 3;
    const rest: number[] = []; for (let t = 0; t < triCount; t++) if (!taken.has(t)) rest.push(t);
    const back = new Matrix4().multiplyMatrices(toModel, m.matrixWorld).invert();
    if (rest.length) { const r = pick(g, rest); r.applyMatrix4(back); m.geometry = r; } else m.visible = false;
  }
  return wheels.map((w, k) => ({ pivot: pivots[k], radius: w.r, sides: sidesOf(pivots[k], w.r), front: w.centre.z > 0 }));
}

/** The connected pieces of a geometry (vertices at the same place count as joined), as triangle lists with boxes. */
function split(g: BufferGeometry, eps: number) {
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
