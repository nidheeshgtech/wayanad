import { BufferAttribute, BufferGeometry, CapsuleGeometry, Color, Matrix4, MeshStandardMaterial, SphereGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * People inside traffic vehicles, seen through the glass: simple smooth busts (head, hair, shoulders, shirt) merged into
 * one mesh per vehicle with vertex colours — one extra draw call, a few hundred triangles a person. Seats are in
 * metres in the vehicle's own frame (x across, + its left; y up from the road; z along, + its front) and scaled to the
 * vehicle's size in traffic. Kerala drives on the left, so the driver sits on the right (−x).
 * Who's aboard is seeded by the vehicle, so a car keeps its passengers.
 */
type Seat = { x: number; y: number; z: number; p: number }; // head height y; p = chance someone sits there
type Plan = { length: number; seats: Seat[] };              // the real vehicle's length the seats are measured on

const row = (z: number, xs: number[], y: number, p: number): Seat[] => xs.map((x) => ({ x, y, z, p }));
const PLANS: Record<string, Plan> = {
  "wagonr-real": { length: 3.6, seats: [{ x: -0.36, y: 1.18, z: 0.15, p: 1 }, ...row(0.15, [0.36], 1.18, 0.6), ...row(-0.62, [-0.36, 0.36], 1.15, 0.35)] },
  "innova-real": { length: 4.58, seats: [{ x: -0.4, y: 1.24, z: 0.42, p: 1 }, ...row(0.42, [0.4], 1.24, 0.7), ...row(-0.4, [-0.4, 0, 0.4], 1.22, 0.55), ...row(-1.2, [-0.35, 0.35], 1.2, 0.35)] },
  "omni-real": { length: 3.4, seats: [{ x: -0.32, y: 1.22, z: 0.75, p: 1 }, ...row(0.75, [0.32], 1.22, 0.5), ...row(-0.2, [-0.35, 0.35], 1.2, 0.5)] },
  "auto-real": { length: 2.65, seats: [{ x: 0, y: 1.2, z: 0.45, p: 1 }, ...row(-0.35, [-0.38, 0, 0.38], 1.18, 0.45)] },
  "lorry-real": { length: 7.8, seats: [{ x: -0.55, y: 2.25, z: 3.15, p: 1 }, ...row(3.15, [0.55], 2.25, 0.45)] },
  "tourbus-real": {
    length: 9.4,
    seats: [{ x: -0.78, y: 2.05, z: 3.95, p: 1 }, ...Array.from({ length: 10 }, (_, i) => row(3.0 - i * 0.78, [-0.85, -0.42, 0.42, 0.85], 2.15, 0.72)).flat()],
  },
};
export const hasOccupants = (name: string) => name in PLANS;

const SHIRTS = [0xe9e5dc, 0x2f4f7a, 0x7a2f34, 0x3f5f3a, 0xc9a24a, 0x4a4a52, 0xd8d0c0, 0x5b3c6e, 0x8a5a2b, 0x2c6e6a, 0xb8462e];
const SKIN = [0x6b4530, 0x7a5038, 0x5a3a28, 0x8a5c40];
const HAIR = [0x141110, 0x1c1714, 0x2a2420, 0x3a3a3a, 0x8a8a86];
// the shapes, in metres, made once: shoulders and chest, neck, head, hair
const torso = new CapsuleGeometry(0.17, 0.28, 3, 8).rotateZ(Math.PI / 2).scale(1, 0.8, 0.55).toNonIndexed();
const head = new SphereGeometry(0.105, 10, 8).scale(0.9, 1.08, 1).toNonIndexed();
const hair = new SphereGeometry(0.112, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.92, 1, 1.02).toNonIndexed();
export const occupantMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });

function painted(g: BufferGeometry, colour: number, m: Matrix4) {
  const out = g.clone().applyMatrix4(m), c = new Color(colour), n = out.getAttribute("position").count, cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
  out.setAttribute("color", new BufferAttribute(cols, 3));
  out.deleteAttribute("uv");
  return out;
}

/** The people in one vehicle as one geometry, for a vehicle `length` long in whatever units the caller uses (traffic:
 * 10 m units, the vehicles page: metres) — the seat plan, in metres, is scaled by length / plan length. Null if nobody's
 * aboard. */
export function occupantsFor(name: string, length: number, seed: number) {
  const plan = PLANS[name];
  if (!plan) return null;
  let s = seed * 9973 + 17;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const k = length / plan.length, parts: BufferGeometry[] = [], m = new Matrix4(), at = new Vector3();
  for (const seat of plan.seats) {
    if (r() > seat.p) continue;
    const shirt = SHIRTS[Math.floor(r() * SHIRTS.length)], skin = SKIN[Math.floor(r() * SKIN.length)], hairCol = HAIR[Math.floor(r() * HAIR.length)];
    const lean = (r() - 0.5) * 0.12, turn = (r() - 0.5) * 0.5;
    at.set(seat.x, seat.y, seat.z);
    const base = new Matrix4().makeTranslation(at.x, at.y, at.z).multiply(new Matrix4().makeRotationY(turn)).multiply(new Matrix4().makeRotationZ(lean));
    parts.push(painted(torso, shirt, m.copy(base).multiply(new Matrix4().makeTranslation(0, -0.33, -0.02))));
    parts.push(painted(head, skin, m.copy(base)));
    parts.push(painted(hair, hairCol, m.copy(base).multiply(new Matrix4().makeTranslation(0, 0.02, -0.008))));
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false)!;
  merged.scale(k, k, k);
  merged.computeBoundingSphere();
  return merged;
}
