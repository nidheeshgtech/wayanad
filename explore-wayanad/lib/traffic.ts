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
  { name: 'privatebus-real', height: .29, length: .94, width: .269, speed: .66 },
] as const;
export type Vehicle = { id: number; kind: number; direction: 1 | -1; distance: number; speed: number };
export const trafficControl = { paused: false, rate: 1, count: 0 };
const up = new Vector3(0, 1, 0);
export function lanePoint(curve: CatmullRomCurve3, distance: number, direction: number, widen: (t: number) => number, out = new Vector3()) {
  const t = Math.max(0, Math.min(1, distance / curve.getLength()));
  const tangent = curve.getTangentAt(t), left = new Vector3(tangent.z, 0, -tangent.x).normalize();
  curve.getPointAt(t, out).addScaledVector(left, direction * (.4 + widen(t)) * .5);
  out.y -= .588; // exact Road.tsx ribbon bed + asphalt lift
  return out;
}
export function vehiclePose(curve: CatmullRomCurve3, v: Vehicle, widen: (t: number) => number) {
  const spec = VEHICLES[v.kind], halfAxle = spec.length * .31;
  const front = lanePoint(curve, v.distance + halfAxle * v.direction, v.direction, widen);
  const rear = lanePoint(curve, v.distance - halfAxle * v.direction, v.direction, widen);
  const forward = front.clone().sub(rear).normalize(), right = up.clone().cross(forward).normalize();
  const normal = forward.clone().cross(right).normalize();
  return { position: front.add(rear).multiplyScalar(.5).addScaledVector(normal, .003), rotation: new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(right, normal, forward)) };
}
export function createFleet(length: number): Vehicle[] {
  const n = Math.max(4, Math.min(160, Math.floor(length / 12)));
  return Array.from({ length: n }, (_, id) => ({ id, kind: [0,1,2,3,1,4,5,7,1,6,3,2][id % 12], direction: id % 2 ? -1 : 1, distance: 2 + (length - 4) * (id + .5) / n, speed: 0 }));
}
/** Snapshot-based car following: all movement uses the same previous frame, never update-order overtaking. */
export function advanceTraffic(fleet: Vehicle[], curve: CatmullRomCurve3, dt: number, rain: number, zones: PassingZone[] = [], viewer?: number) {
  const length = curve.getLength(), span = length - 4;
  dt = Math.min(.05, Math.max(0, dt));
  // the viewer rides up the road (direction 1) like a bus: it holds narrow bends against oncoming traffic too
  const stops = reservePassingZones(viewer === undefined ? fleet : [...fleet, { id: -1, kind: 0, direction: 1, distance: viewer, speed: 0 }], zones);
  const moves = fleet.map(v => {
    const spec = VEHICLES[v.kind], t = v.distance / length;
    const a = curve.getTangentAt(Math.max(0, t - 1.2 / length));
    const b = curve.getTangentAt(Math.min(1, t + 1.2 / length));
    const bend = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
    let desired = Math.min(spec.speed, .23 / Math.max(.3, bend)) * (1 - .22 * rain);
    let room = stops.get(v.id) ?? Infinity;
    for (const other of fleet) if (other !== v && other.direction === v.direction) {
      const gap = ((other.distance - v.distance) * v.direction + span) % span;
      const clearance = gap - (spec.length + VEHICLES[other.kind].length) / 2;
      const safe = .65 + v.speed * (2 + rain * 2);
      room = Math.min(room, clearance - safe);
    }
    desired = Math.min(desired, Math.max(0, room * .5));
    const speed = Math.max(0, Math.min(desired, v.speed + dt * .12));
    return { speed, move: Math.min(speed * dt, Math.max(0, room)) };
  });
  fleet.forEach((v,i) => { v.speed = moves[i].speed; v.distance = 2 + ((v.distance - 2 + v.direction * moves[i].move) % span + span) % span; });
}

/** The viewer's seat, as units along the road. Uphill traffic never shares it: vehicles ahead keep VIEWER_GAP.ahead
 * clear in front of the seat (pulled on ahead as the scroll drives forward), vehicles behind stay VIEWER_GAP.behind
 * back, and the ones beyond are moved on in turn so nothing overlaps. Oncoming traffic is untouched. Without this the
 * scroll-driven seat drove through slower cars, or cars caught up under it. */
export const VIEWER_GAP = { ahead: 1.5, behind: 1.1, spacing: .35 };
export function keepClearOfViewer(fleet: Vehicle[], length: number, viewer: number) {
  const span = length - 4, wrap = (d: number) => 2 + ((d - 2) % span + span) % span;
  const mine = fleet.filter(v => v.direction === 1);
  const signed = (v: Vehicle) => { const g = ((v.distance - viewer) % span + span) % span; return g > span / 2 ? g - span : g; };
  const half = (v: Vehicle) => VEHICLES[v.kind].length / 2;
  const ahead = mine.filter(v => signed(v) >= 0).sort((a, b) => signed(a) - signed(b));
  const behind = mine.filter(v => signed(v) < 0).sort((a, b) => signed(b) - signed(a));
  let edge = VIEWER_GAP.ahead; // nearest allowed rear bumper, units ahead of the seat
  for (const v of ahead) { const g = signed(v); if (g - half(v) >= edge) break; v.distance = wrap(viewer + edge + half(v)); edge += 2 * half(v) + VIEWER_GAP.spacing; }
  edge = VIEWER_GAP.behind;
  for (const v of behind) { const g = -signed(v); if (g - half(v) >= edge) break; v.distance = wrap(viewer - edge - half(v)); v.speed = 0; edge += 2 * half(v) + VIEWER_GAP.spacing; }
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
