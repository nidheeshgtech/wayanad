import { Box3, BufferGeometry, Group, Matrix4, Mesh, Vector3, type Object3D } from "three";
import { plainGeometry } from "@/lib/vehicleAssets";
import { split } from "@/lib/autoWheels";

/**
 * A helicopter's rotors found in a model that doesn't name them (the showroom: app/cars/new), so they can turn.
 * The model must stand on y = 0, nose to +z. The main rotor(s): thin, wide pieces up at the top — each set (a tandem has
 * two) gathered round its own mast and turned about the vertical. The tail rotor: thin pieces at the very back, flat
 * to the side — turned about the side-to-side line. Each set is moved into a group whose origin is its hub.
 */
export type Rotor = { pivot: Group; axis: "y" | "x"; radius: number };
type Piece = { mesh: Mesh; tris: number[]; box: Box3 };

export function autoRotors(model: Object3D, hint: { tail?: [number, number, number]; main?: string; hub?: [number, number] } = {}): Rotor[] {
  model.updateMatrixWorld(true);
  const toModel = new Matrix4().copy(model.matrixWorld).invert();
  const all = new Box3().setFromObject(model), size = all.getSize(new Vector3()), L = size.z, H = size.y, top = all.max.y, back = all.min.z;
  const local = new Map<Mesh, BufferGeometry>(), pieces: Piece[] = [];
  model.traverse((o) => { const m = o as Mesh; if (m.isMesh && !Array.isArray(m.material) && m.visible) {
    const g = plainGeometry(m.geometry, new Matrix4().multiplyMatrices(toModel, m.matrixWorld)); local.set(m, g);
    for (const p of split(g, L * 1e-4)) pieces.push({ mesh: m, ...p });
  } });
  const s = new Vector3(), c = new Vector3();

  // main rotor: thin pieces in the top part reaching far across (the blades). Its hub: the mean of the blades' own
  // middles (N blades evenly round a hub average out to it; a one-piece rotor's middle is it). Then everything thin
  // in the blades' band within their reach turns too: tips, hub, the rest of the head.
  const mid = (p: Piece) => p.box.getCenter(new Vector3());
  // (`main`: the rotor is this part — by its mesh's or material's name — whatever its shape: blades with droop)
  const blades = hint.main
    ? pieces.filter((p) => p.mesh.name === hint.main || (p.mesh.material as { name?: string }).name === hint.main).filter((p, _, all) => { p.box.getSize(s); return all.length === 1 || Math.max(s.x, s.z) > 0.15 * L; })
    : pieces.filter((p) => { p.box.getSize(s); return p.box.min.y > top - 0.4 * H && s.y < 0.12 * H && Math.max(s.x, s.z) > 0.15 * L; });
  const mains: { box: Box3; parts: Piece[]; hub: Vector3 }[] = [];
  if (blades.length) {
    const hub = blades.reduce((h, p) => h.add(mid(p)), new Vector3()).multiplyScalar(1 / blades.length);
    if (hint.hub) hub.set(hint.hub[0], hub.y, hint.hub[1]);
    let R = 0, y0 = Infinity, y1 = -Infinity;
    for (const p of blades) { for (const x of [p.box.min.x, p.box.max.x]) for (const z of [p.box.min.z, p.box.max.z]) R = Math.max(R, Math.hypot(x - hub.x, z - hub.z)); y0 = Math.min(y0, p.box.min.y); y1 = Math.max(y1, p.box.max.y); }
    const parts = pieces.filter((p) => {
      if (blades.includes(p) || (hint.main && (p.mesh.name === hint.main || (p.mesh.material as { name?: string }).name === hint.main))) return true;
      p.box.getSize(s); const q = mid(p);
      // (the head: small things on the mast's line, a little below the blades too)
      const head = Math.hypot(q.x - hub.x, q.z - hub.z) < 0.08 * R && Math.max(s.x, s.z) < 0.25 * R && p.box.min.y > y0 - 0.06 * H && p.box.max.y < y1 + 0.06 * H;
      const tip = s.y < 0.06 * H && p.box.min.y > y0 - 0.02 * H && p.box.max.y < y1 + 0.02 * H && Math.hypot(q.x - hub.x, q.z - hub.z) < R;
      return head || tip;
    });
    mains.push({ box: parts.reduce((b, p) => b.union(p.box), new Box3()), parts, hub });
  }

  // tail rotor: given (`tail`: its hub's height and place along, and its radius, in the model's frame, metres) — the
  // pieces wholly inside that sphere and flat to the side; else looked for at the very back
  const tails: { box: Box3; parts: Piece[]; hub?: Vector3 }[] = [];
  const free = (p: Piece) => !mains.some((t) => t.parts.includes(p));
  if (hint.tail) {
    const [ty, tz, tr] = hint.tail;
    const parts = pieces.filter((p) => { if (!free(p)) return false; const q = mid(p); p.box.getSize(s); return Math.hypot(q.y - ty, q.z - tz) + Math.max(s.y, s.z) / 2 < tr * 1.05 && s.x < 0.6 * tr; });
    if (parts.length) { const box = parts.reduce((b, p) => b.union(p.box), new Box3()); tails.push({ box, parts, hub: new Vector3(box.getCenter(c).x, ty, tz) }); }
  } else {
    const bits = pieces.filter((p) => { if (!free(p)) return false; p.box.getSize(s); p.box.getCenter(c); return c.z < back + 0.14 * L && s.x < 0.3 * Math.max(s.y, s.z) && Math.max(s.y, s.z) > 0.04 * L && Math.max(s.y, s.z) < 0.16 * L && c.y > 0.25 * H; });
    if (bits.length >= 2) {
      const hub = bits.reduce((h, p) => h.add(mid(p)), new Vector3()).multiplyScalar(1 / bits.length), box = bits.reduce((b, p) => b.union(p.box), new Box3());
      box.getSize(s); if (Math.abs(s.y - s.z) < 0.3 * Math.max(s.y, s.z)) tails.push({ box, parts: bits, hub });
    }
  }

  const rotors: Rotor[] = [];
  const take = (set: { box: Box3; parts: Piece[]; hub?: Vector3 }, axis: "y" | "x") => {
    const hub = set.hub ?? set.box.getCenter(new Vector3()), pivot = new Group(); pivot.position.copy(hub); pivot.name = "rotor"; model.add(pivot);
    for (const [m, g] of local) {
      const tris = set.parts.filter((p) => p.mesh === m).flatMap((p) => p.tris);
      if (!tris.length) continue;
      const part = new Mesh(pick(g, tris), m.material); part.name = m.name; part.geometry.translate(-hub.x, -hub.y, -hub.z); pivot.add(part);
      const keep = new Set(tris), count = (g.index ? g.index.count : g.getAttribute("position").count) / 3, rest: number[] = [];
      for (let t = 0; t < count; t++) if (!keep.has(t)) rest.push(t);
      const back = new Matrix4().multiplyMatrices(toModel, m.matrixWorld).invert();
      // (the mesh keeps the rest; its own geometry and `local` both change, so a later rotor cuts from what's left)
      if (rest.length) { const r = pick(g, rest); local.set(m, r.clone()); r.applyMatrix4(back); m.geometry = r; } else { m.visible = false; local.delete(m); }
      for (const p of pieces) if (p.mesh === m) { const map = new Map<number, number>(); rest.forEach((t, j) => map.set(t, j)); p.tris = p.tris.filter((t) => map.has(t)).map((t) => map.get(t)!); }
    }
    set.box.getSize(s); rotors.push({ pivot, axis, radius: Math.max(s.x, s.y, s.z) / 2 });
  };
  for (const t of mains) take(t, "y");
  for (const t of tails) take(t, "x");
  return rotors;
}

function pick(g: BufferGeometry, tris: number[]) {
  const out = new BufferGeometry(), ix = g.index;
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name), sz = a.itemSize, f = new Float32Array(tris.length * 3 * sz);
    tris.forEach((t, j) => { for (let k = 0; k < 3; k++) { const v = ix ? ix.getX(t * 3 + k) : t * 3 + k; for (let q = 0; q < sz; q++) f[(j * 3 + k) * sz + q] = a.getComponent(v, q); } });
    out.setAttribute(name, new (a.constructor as typeof import("three").BufferAttribute)(f, sz));
  }
  return out;
}
