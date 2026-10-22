import { CatmullRomCurve3, Vector3, Quaternion, Matrix4 } from 'three';

/** World units are ten metres. Models face +Z; left is tangent × world-up. */
export const VEHICLES = [
  // real models (Sketchfab, CC BY; see public/models/traffic/ATTRIBUTION.md), sized to their own proportions. Both buses
  // keep the 9.4 m length the passing-zone footprint assumes (busFootprint).
  { name: 'ksrtc-real', height: .262, length: .94, width: .225, speed: .62 },
  { name: 'wagonr-real', height: .169, length: .36, width: .171, speed: .8 },
  { name: 'innova-real', height: .168, length: .458, width: .208, speed: .76 },
  { name: 'rider-bike-real', height: .128, length: .21, width: .102, speed: .72 },
  { name: 'lorry-real', height: .324, length: .78, width: .271, speed: .52 },
  { name: 'auto-real', height: .17, length: .265, width: .146, speed: .55 },
  { name: 'omni-real', height: .171, length: .34, width: .174, speed: .65 },
  { name: 'privatebus-real', height: .262, length: .94, width: .225, speed: .66 },
  { name: 'tourbus-real', height: .288, length: .94, width: .225, speed: .64 },
] as const;
/** How a vehicle is behaving toward the viewer: see interactWithViewer. `shift` (0–1) eases it toward its own road edge. */
export type Mode = 'cruise' | 'follow' | 'yield' | 'passed' | 'caution';
export type Vehicle = { id: number; kind: number; direction: 1 | -1; distance: number; speed: number; mode?: Mode; shift?: number; wait?: number };
/** Shared with the dev review panel (WeatherDebug): pause/rate, what's nearby, and the viewer's seat and give-way state.
 * stage*: dev-only hooks that put a vehicle just ahead of the seat to review a catch-up or an overtake. */
export const trafficControl = { paused: false, rate: 1, count: 0, seat: -1, overtaking: false, following: false, held: null as string | null, horn: false, stageAhead: 0, stageMode: 'cruise' as Mode, staged: -1, stagedInfo: '',
  fleet: [] as Vehicle[], curve: null as CatmullRomCurve3 | null }; // stageAhead: dev review only
const up = new Vector3(0, 1, 0);
export function lanePoint(curve: CatmullRomCurve3, distance: number, direction: number, widen: (t: number) => number, out = new Vector3(), edge = 0) {
  const t = Math.max(0, Math.min(1, distance / curve.getLength()));
  const tangent = curve.getTangentAt(t), left = new Vector3(tangent.z, 0, -tangent.x).normalize();
  curve.getPointAt(t, out).addScaledVector(left, direction * ((.4 + widen(t)) * .5 + edge));
  out.y -= .588; // exact Road.tsx ribbon bed + asphalt lift
  return out;
}
/** How far (units) a vehicle may ease toward its road edge: up to DRIVE.edge, less for wide ones so the outer wheels
 * stay on the asphalt and shoulder (Traffic hides any vehicle whose corners leave it). */
export function edgeRoom(kind: number) { return Math.max(0, Math.min(DRIVE.edge, .37 - .2 - VEHICLES[kind].width / 2)); }
export function vehiclePose(curve: CatmullRomCurve3, v: Vehicle, widen: (t: number) => number) {
  const spec = VEHICLES[v.kind], halfAxle = spec.length * .31, edge = (v.shift ?? 0) * edgeRoom(v.kind);
  const front = lanePoint(curve, v.distance + halfAxle * v.direction, v.direction, widen, undefined, edge);
  const rear = lanePoint(curve, v.distance - halfAxle * v.direction, v.direction, widen, undefined, edge);
  const forward = front.clone().sub(rear).normalize(), right = up.clone().cross(forward).normalize();
  const normal = forward.clone().cross(right).normalize();
  return { position: front.add(rear).multiplyScalar(.5).addScaledVector(normal, .003), rotation: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, normal, forward)) };
}
/** The mix, in the order vehicles are handed out: cars and two-wheelers most, then buses (state, private, tourist),
 * lorries, autos and vans — about one bus in five. */
const MIX = [0, 1, 2, 3, 1, 4, 5, 7, 1, 6, 3, 2, 8, 1, 2, 3];
/** Up to 340 vehicles, half each way, spread by `density` (relative, along the road: more by the towns, fewer on the
 * hairpins) — placed at equal steps of the density's running total, so busy stretches get more of them. */
export function createFleet(length: number, density: (d: number) => number = () => 1): Vehicle[] {
  const n = Math.max(4, Math.min(340, Math.floor(length / 8)));
  const steps = 2000, cum = new Float64Array(steps + 1);
  for (let i = 0; i < steps; i++) cum[i + 1] = cum[i] + Math.max(0.05, density(2 + ((length - 4) * (i + 0.5)) / steps));
  const at = (u: number) => { let lo = 0, hi = steps; const x = u * cum[steps]; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= x) lo = mid; else hi = mid; } return 2 + ((length - 4) * (lo + (x - cum[lo]) / Math.max(1e-9, cum[hi] - cum[lo]))) / steps; };
  return Array.from({ length: n }, (_, id) => ({ id, kind: MIX[id % MIX.length], direction: id % 2 ? -1 : 1, distance: at((id + 0.5) / n), speed: 0 }));
}
/** Snapshot-based car following: all movement uses the same previous frame, never update-order overtaking. */
/** Something on the road traffic must not drive into: the player's bus in drive mode. `lanes`: the lanes it covers. */
export type Obstacle = { distance: number; length: number; lanes: (1 | -1)[] };
export function advanceTraffic(fleet: Vehicle[], curve: CatmullRomCurve3, dt: number, rain: number, zones: PassingZone[] = [], viewer?: number, obstacles: Obstacle[] = []) {
  const length = curve.getLength(), span = length - 4;
  dt = Math.min(.05, Math.max(0, dt));
  // the viewer rides up the road (direction 1) like a bus: it holds narrow bends against oncoming traffic too
  const stops = reservePassingZones(viewer === undefined ? fleet : [...fleet, { id: -1, kind: 0, direction: 1, distance: viewer, speed: 0 }], zones);
  // the two vehicles ahead of each in its own direction: one sort per direction (checking every pair was O(n²))
  const ahead = new Map<Vehicle, Vehicle[]>();
  for (const dir of [1, -1]) {
    const lane = fleet.filter(v => v.direction === dir).sort((a, b) => (a.distance - b.distance) * dir);
    lane.forEach((v, i) => ahead.set(v, [lane[(i + 1) % lane.length], lane[(i + 2) % lane.length]].filter(o => o !== v)));
  }
  const bends = bendTable(curve);
  const moves = fleet.map(v => {
    const spec = VEHICLES[v.kind], bend = bendAt(bends, v.distance);
    // each vehicle its own pace (±10%), held back while it gives way or takes care (interactWithViewer)
    const cap = v.mode === 'yield' ? DRIVE.yieldPace : v.mode === 'caution' ? DRIVE.cautionPace : 1;
    let desired = Math.min(spec.speed * pace(v.id) * cap, .23 / Math.max(.3, bend)) * (1 - .22 * rain);
    let room = stops.get(v.id) ?? Infinity;
    for (const other of ahead.get(v)!) {
      const gap = ((other.distance - v.distance) * v.direction + span) % span;
      const clearance = gap - (spec.length + VEHICLES[other.kind].length) / 2;
      const safe = .65 + v.speed * (2 + rain * 2);
      room = Math.min(room, clearance - safe);
    }
    for (const o of obstacles) if (o.lanes.includes(v.direction)) {
      const gap = (o.distance - v.distance) * v.direction;
      if (gap > 0) room = Math.min(room, gap - (spec.length + o.length) / 2 - (.65 + v.speed * (2 + rain * 2)));
    }
    desired = Math.min(desired, Math.max(0, room * .5));
    const speed = Math.max(0, Math.min(desired, v.speed + dt * .12));
    return { speed, move: Math.min(speed * dt, Math.max(0, room)) };
  });
  fleet.forEach((v,i) => { v.speed = moves[i].speed; v.distance = 2 + ((v.distance - 2 + v.direction * moves[i].move) % span + span) % span; });
}

const pace = (id: number) => { const x = Math.sin(id * 12.9898) * 43758.5453; return .9 + .2 * (x - Math.floor(x)); };

/** Driving up the road with the viewer (units of 10 m, seconds). */
export const DRIVE = {
  ahead: 1.5, behind: 1.1, spacing: .35,  // clear space kept in front of / behind the seat, and between vehicles moved on
  approach: 3,                            // a slower vehicle this close ahead (rear bumper) is being followed
  autoYield: 2.2,                         // after this long following on a safe stretch it gives way by itself (horn: at once)
  yieldPace: .55, cautionPace: .5,        // share of normal speed while giving way / while oncoming past an overtake
  edge: .05, ease: .45,                   // how far toward its edge a vehicle moves (0.5 m), and how gently (time constant)
  look: 4, maxBend: .22,                  // overtaking needs the road ahead this far to turn less than this (radians)
};
const tangentAt = (curve: CatmullRomCurve3, d: number) => curve.getTangentAt(Math.max(0, Math.min(1, d / curve.getLength())));
/** Somewhere a slower vehicle can let the viewer by: the road ahead fairly straight and open (no hairpin widening, no
 * one-at-a-time bend), and no oncoming vehicle right alongside. */
export function safeToPass(curve: CatmullRomCurve3, widen: (t: number) => number, zones: PassingZone[], fleet: Vehicle[], seat: number) {
  const L = curve.getLength(), t0 = tangentAt(curve, seat);
  for (let d = 1; d <= DRIVE.look; d++) {
    if (Math.acos(Math.max(-1, Math.min(1, t0.dot(tangentAt(curve, seat + d))))) > DRIVE.maxBend) return false;
    if (widen(Math.min(1, (seat + d) / L)) > .015) return false;
  }
  if (zones.some(z => seat + DRIVE.look > z.from && seat - 1 < z.to)) return false;
  return !fleet.some(v => v.direction === -1 && v.distance > seat - .5 && v.distance < seat + 1.2);
}

/**
 * The viewer's seat rides up the road (direction 1) at scroll pace, on the centre line. Uphill traffic:
 * - catching up with a slower vehicle, the viewer follows it (it's moved on ahead, keeping DRIVE.ahead clear);
 * - on a safe stretch, after DRIVE.autoYield s of following — or at once on the horn — it gives way: eases toward the
 *   left edge and slows, and the viewer passes on its right; once behind, it drifts back into its lane;
 * - on bends, hairpins and one-at-a-time sections nobody gives way: traffic stays in line;
 * - vehicles behind the seat stay DRIVE.behind back; the ones ahead are moved on in turn so nothing overlaps.
 * Oncoming traffic carries on in its lane, except while the viewer is overtaking: those just ahead slow and keep to
 * their edge (caution). `fits(v)` says whether a vehicle may stand at its edge here (Traffic checks the ground).
 */
export function interactWithViewer(fleet: Vehicle[], curve: CatmullRomCurve3, widen: (t: number) => number, zones: PassingZone[],
  seat: number, seatSpeed: number, dt: number, horn: boolean, fits: (v: Vehicle) => boolean = () => true) {
  const length = curve.getLength(), span = length - 4, wrap = (d: number) => 2 + ((d - 2) % span + span) % span;
  const signed = (v: Vehicle) => { const g = ((v.distance - seat) % span + span) % span; return g > span / 2 ? g - span : g; };
  const half = (v: Vehicle) => VEHICLES[v.kind].length / 2;
  const mine = fleet.filter(v => v.direction === 1);
  // vehicles being passed: back to normal once well behind, or once they've pulled away (the viewer stopped)
  for (const v of mine) if (v.mode === 'yield' || v.mode === 'passed') {
    const g = signed(v);
    if (g + half(v) < -DRIVE.behind || g - half(v) > DRIVE.approach + 1) v.mode = 'cruise';
    else if (v.mode === 'yield' && g + half(v) < 0) v.mode = 'passed';
  }
  const passing = (v: Vehicle) => v.mode === 'yield' || v.mode === 'passed';
  const ahead = mine.filter(v => signed(v) >= -half(v)).sort((a, b) => signed(a) - signed(b));
  // the nearest vehicle ahead that isn't already giving way: is the viewer stuck behind it?
  const lead = ahead.find(v => !passing(v));
  let held: string | null = null; // why the vehicle ahead isn't giving way (review)
  for (const v of mine) if (v !== lead) { v.wait = 0; if (v.mode === 'follow') v.mode = 'cruise'; }
  if (lead && signed(lead) - half(lead) < DRIVE.approach && signed(lead) > 0) {
    if (seatSpeed > .02) lead.wait = (lead.wait ?? 0) + dt; // only while the viewer presses on
    const asked = horn || (lead.wait ?? 0) > DRIVE.autoYield;
    held = !asked ? 'waiting' : !safeToPass(curve, widen, zones, fleet, seat) ? 'not safe here' : !fits(lead) ? 'no room at the edge' : null;
    if (!held) { lead.mode = 'yield'; lead.wait = 0; } else lead.mode = 'follow';
  }
  // keep the seat clear: vehicles ahead (in order) moved on as needed; anyone giving way stays put and is passed
  let edge = DRIVE.ahead;
  for (const v of ahead) {
    const g = signed(v);
    if (passing(v)) { edge = Math.max(edge, g + half(v) + DRIVE.spacing); continue; }
    if (g - half(v) < edge) v.distance = wrap(seat + edge + half(v));
    edge = signed(v) + half(v) + DRIVE.spacing;
  }
  edge = DRIVE.behind;
  for (const v of mine.filter(v => signed(v) < -half(v) && !passing(v)).sort((a, b) => signed(b) - signed(a))) {
    const g = -signed(v); if (g - half(v) >= edge) break;
    v.distance = wrap(seat - edge - half(v)); v.speed = 0; edge += 2 * half(v) + DRIVE.spacing;
  }
  // oncoming traffic takes care while the viewer is alongside a vehicle it's overtaking
  const overtaking = mine.some(v => passing(v) && Math.abs(signed(v)) < half(v) + 1.5);
  for (const v of fleet) if (v.direction === -1) {
    const g = signed(v);
    if (overtaking && g > -1 && g < 6) v.mode = 'caution'; else if (v.mode === 'caution') v.mode = 'cruise';
  }
  // ease toward the edge (or back into the lane) gently
  const k = 1 - Math.exp(-dt / DRIVE.ease);
  for (const v of fleet) v.shift = (v.shift ?? 0) + ((passing(v) || v.mode === 'caution' ? 1 : 0) - (v.shift ?? 0)) * k;
  return { overtaking, following: !!lead && lead.mode === 'follow', held };
}

/* ---- drive mode: the player's bus among the traffic ---- */
/** `steer`: the wheel, −1…1 (lets you creep round a vehicle you're touching: collidePlayer). */
export type Player = { s: number; lat: number; speed: number; halfL: number; halfW: number; steer?: number };
/** The lanes the player's bus covers: its own (left, 1) and/or the oncoming one (right, −1). */
export const playerLanes = (p: Player): (1 | -1)[] => [...(p.lat + p.halfW > 0.02 ? [1 as const] : []), ...(p.lat - p.halfW < -0.02 ? [-1 as const] : [])];
/** A vehicle's centre, units left of the road's centre line (oncoming traffic: negative). */
export const vehicleLat = (v: Vehicle, widen: (t: number) => number, length: number) =>
  v.direction * ((.4 + widen(Math.min(1, Math.max(0, v.distance / length)))) * .5 + (v.shift ?? 0) * edgeRoom(v.kind));

/**
 * Traffic and the player's bus (drive mode). Same states as with the viewer's seat, but the bus is real:
 * - a slower vehicle ahead in your lane: after a while behind it, or at once on the horn, it gives way where it's safe
 *   (eases left, slows) so you can pass; on bends and hairpins it doesn't;
 * - pull out into the oncoming lane and the oncoming vehicles ahead take care: slow and keep to their edge, and car
 *   following (advanceTraffic's obstacles) stops them short of you rather than through you;
 * - nobody is moved about: you brake, they brake.
 */
export function interactWithPlayer(fleet: Vehicle[], curve: CatmullRomCurve3, widen: (t: number) => number, zones: PassingZone[],
  p: Player, dt: number, horn: boolean, fits: (v: Vehicle) => boolean = () => true) {
  const length = curve.getLength(), lanes = playerLanes(p), half = (v: Vehicle) => VEHICLES[v.kind].length / 2;
  const mine = fleet.filter(v => v.direction === 1), passing = (v: Vehicle) => v.mode === 'yield' || v.mode === 'passed';
  for (const v of mine) if (passing(v)) {
    const g = v.distance - p.s;
    if (g + half(v) < -p.halfL - DRIVE.behind || g - half(v) > DRIVE.approach + 1) v.mode = 'cruise';
    else if (v.mode === 'yield' && g + half(v) < -p.halfL) v.mode = 'passed';
  }
  // the vehicle you're stuck behind: nearest ahead in your lane, close, and not faster than you
  const lead = lanes.includes(1) ? mine.filter(v => !passing(v) && v.distance - p.s > 0).sort((a, b) => a.distance - b.distance)[0] : undefined;
  let held: string | null = null;
  for (const v of mine) if (v !== lead) { v.wait = 0; if (v.mode === 'follow') v.mode = 'cruise'; }
  if (lead && lead.distance - half(lead) - (p.s + p.halfL) < DRIVE.approach) {
    if (p.speed > .05 || horn) lead.wait = (lead.wait ?? 0) + dt;
    const asked = horn || (lead.wait ?? 0) > DRIVE.autoYield;
    held = !asked ? 'waiting' : !safeToPass(curve, widen, zones, fleet, p.s) ? 'not safe here' : !fits(lead) ? 'no room at the edge' : null;
    if (!held) { lead.mode = 'yield'; lead.wait = 0; } else lead.mode = 'follow';
  }
  // oncoming: take care while you're out in their lane, or alongside someone you're overtaking
  const alongside = mine.some(v => passing(v) && Math.abs(v.distance - p.s) < half(v) + p.halfL + 1);
  const out = lanes.includes(-1);
  for (const v of fleet) if (v.direction === -1) {
    const g = v.distance - p.s;
    if ((out && g > -p.halfL && g < 8) || (alongside && g > -1 && g < 6)) v.mode = 'caution'; else if (v.mode === 'caution') v.mode = 'cruise';
  }
  const k = 1 - Math.exp(-dt / DRIVE.ease);
  for (const v of fleet) v.shift = (v.shift ?? 0) + ((passing(v) || v.mode === 'caution' ? 1 : 0) - (v.shift ?? 0)) * k;
  return { overtaking: out || alongside, following: !!lead && lead.mode === 'follow', held };
}

/** Keep the player's bus out of the vehicles: where footprints overlap (along the road and across it), the bus is put
 * back at the contact and slowed to the other vehicle's pace (head-on: stopped). Returns the knock (0 = none). */
const CREEP = .25; // units/s
/* How sharply the road turns at each point (the angle between its direction 12 m back and 12 m ahead), worked out
 * once per road in 0.25-unit steps: every vehicle needs it every frame to slow for the bends, and two tangent
 * lookups each, 340 vehicles a frame, was a large share of the traffic's time on phones. */
const BEND_STEP = .25, bendTables = new WeakMap<CatmullRomCurve3, Float32Array>();
function bendTable(curve: CatmullRomCurve3) {
  let table = bendTables.get(curve);
  if (table) return table;
  const length = curve.getLength(), n = Math.ceil(length / BEND_STEP) + 1;
  table = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, (i * BEND_STEP) / length);
    const a = curve.getTangentAt(Math.max(0, t - 1.2 / length)), b = curve.getTangentAt(Math.min(1, t + 1.2 / length));
    table[i] = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
  }
  bendTables.set(curve, table);
  return table;
}
const bendAt = (table: Float32Array, d: number) => table[Math.min(table.length - 1, Math.max(0, Math.round(d / BEND_STEP)))];
export function collidePlayer(fleet: Vehicle[], curve: CatmullRomCurve3, widen: (t: number) => number, p: Player) {
  const length = curve.getLength();
  let knock = 0;
  for (const v of fleet) {
    const spec = VEHICLES[v.kind], reach = spec.length / 2 + p.halfL, g = v.distance - p.s;
    if (Math.abs(g) >= reach) continue;
    if (Math.abs(vehicleLat(v, widen, length) - p.lat) >= spec.width / 2 + p.halfW) continue;
    const theirs = v.direction * v.speed; // their speed along the road, in your direction
    knock = Math.max(knock, Math.min(1, Math.abs(p.speed - theirs)));
    // nose to tail with it: you can't go through, but with the wheel turned you can creep on (up to ~9 km/h with full
    // lock) so the nose swings out and you pull round it; without steering you're held at its speed, as before
    if (g > 0) { p.s = v.distance - reach - .01; p.speed = Math.min(p.speed, Math.max(0, theirs) + CREEP * Math.min(1, Math.abs(p.steer ?? 0) * 1.5)); }
    else { p.s = v.distance + reach + .01; p.speed = Math.max(p.speed, theirs); }
  }
  return knock;
}

export type PassingZone = { from: number; to: number; owner: 1 | -1 | null };
/** SAT on the largest vehicle footprint; conservative for cars and bikes. */
export function busFootprint(curve: CatmullRomCurve3, distance: number, direction: 1 | -1, widen: (t:number)=>number) {
  const pose=vehiclePose(curve,{id:0,kind:0,direction,distance,speed:0},widen);
  return [[-.14,-.47],[.14,-.47],[.14,.47],[-.14,.47]].map(([x,z])=>new Vector3(x,0,z).applyQuaternion(pose.rotation).add(pose.position));
}
export function footprintsOverlap(a: Vector3[], b: Vector3[]) {
  if(Math.abs(a[0].y-b[0].y)>.35)return false;
  for(const poly of [a,b])for(let i=0;i<4;i++) {
    const p=poly[i],q=poly[(i+1)%4],ax=-(q.z-p.z),az=q.x-p.x;
    const aa=a.map(v=>v.x*ax+v.z*az),bb=b.map(v=>v.x*ax+v.z*az);
    if(Math.max(...aa)<=Math.min(...bb)||Math.max(...bb)<=Math.min(...aa))return false;
  }
  return true;
}
/** Reserve narrow spline bends before vehicles enter, avoiding nose-to-nose deadlocks. */
export function passingZones(curve: CatmullRomCurve3, widen: (t:number)=>number): PassingZone[] {
  const zones:PassingZone[]=[];
  for(let d=3;d<curve.getLength()-3;d+=.25) {
    const a=busFootprint(curve,d,1,widen);
    if(![-1,-.5,0,.5,1].some(off=>footprintsOverlap(a,busFootprint(curve,d+off,-1,widen))))continue;
    const last=zones[zones.length-1];
    if(last && d-3<=last.to)last.to=d+3;else zones.push({from:d-3,to:d+3,owner:null});
  }
  return zones;
}
export function reservePassingZones(fleet: Vehicle[], zones: PassingZone[]) {
  const stops=new Map<number,number>();
  for(const zone of zones) {
    const inside=fleet.filter(v=>v.distance>zone.from && v.distance<zone.to);
    if(!inside.some(v=>v.direction===zone.owner))zone.owner=inside[0]?.direction??null;
    if(zone.owner===null){
      const arriving=fleet.filter(v=>v.direction===1 ? v.distance<=zone.from && zone.from-v.distance<4 : v.distance>=zone.to && v.distance-zone.to<4)
        .sort((a,b)=>Math.min(Math.abs(a.distance-zone.from),Math.abs(a.distance-zone.to))-Math.min(Math.abs(b.distance-zone.from),Math.abs(b.distance-zone.to)));
      zone.owner=arriving[0]?.direction??null;
    }
    for(const v of fleet)if(zone.owner!==null && v.direction!==zone.owner){
      const distance=v.direction===1 ? zone.from-v.distance : v.distance-zone.to;
      if(distance>=0 && distance<4)stops.set(v.id,Math.min(stops.get(v.id)??Infinity,Math.max(0,distance-.6)));
    }
  }
  return stops;
}
