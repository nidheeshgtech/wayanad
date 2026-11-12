'use client';
import { use, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, BoxGeometry, CanvasTexture, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, Raycaster, SRGBColorSpace, Texture, TextureLoader, Vector3, type Object3D } from 'three';
import { destinationBoard, hasBoard, loadVehicle, type BoardText } from '@/lib/vehicleAssets';
import { height, roadDistance, roadShapeAt } from '@/lib/terrain';
import { advanceTraffic, createFleet, edgeRoom, interactWithPlayer, interactWithViewer, passingZones, playerLanes, trafficControl, TRAFFIC_PAINTS, VEHICLES, vehiclePose, type Obstacle, type Player, type Vehicle } from '@/lib/traffic';
import { CAR, game } from '@/lib/game';
import { honk, honking } from '@/lib/horn';
import { driveT, driveT2 } from '@/lib/drive';
import { scrollState } from '@/lib/scrollState';
import { weather } from '@/lib/weather';
import { duskness } from '@/lib/theme';
import { frameTimed, perfStats } from '@/lib/perf';
import { quality } from '@/lib/quality';
import { net } from '@/lib/net';
import { hasOccupants, occupantMaterial, occupantsFor, type OccupiedSeat } from '@/lib/occupants';
import { addRider } from '@/lib/carModel';
import { cutBikeWheels } from '@/lib/bikeWheels';
import { board, crewFrame, disembark, poseCrew, type Crew } from '@/lib/crew';
/** Real people up close (lib/crew): vehicles this near the camera (units) get them, up to `cap` people in all, a bus's
 * nearest `bus` seats; phones fewer and nearer. */
// (buses from further: they're big, their windows read from further off)
const CREW = { full: { near: 4.5, cap: 24, bus: 10, busNear: 7 }, small: { near: 3, cap: 8, bus: 4, busNear: 4.5 } };
const RIDERLESS = /^(pulsar|enfield)-real$/;
const JACKETS = ['#1d2230', '#7a2f34', '#2f4f7a', '#3f5f3a', '#4a4a52', '#8a5a2b'];
import { ADVERTISE, BUS_SIDES } from '@/data/sponsors';
const lampGeometry = new BoxGeometry(.025,.013,.005);
/**
 * Where a vehicle's front actually is at lamp height `y` (its own frame, x across): the first surface met coming from
 * ahead. A fixed half-length put a bike's lamp at the tip of its front tyre, floating in the air ahead of the headlamp.
 * Measured once per kind (the models are shared).
 */
const fronts = new Map<number, number>();
function frontAt(kind: number, model: Object3D, x: number, y: number, fallback: number) {
  const key = kind * 1000 + Math.round(x * 1000);
  let z = fronts.get(key);
  if (z === undefined) {
    model.updateMatrixWorld(true);
    const hits = new Raycaster(new Vector3(x, y, 50), new Vector3(0, 0, -1)).intersectObject(model, true).filter(h => h.object.name !== 'rider');
    z = hits.length ? hits[0].point.z : fallback;
    fronts.set(key, z);
  }
  return z;
}
/** How far a knocked-over bike lies over (radians, ~80°: on its side, the handlebar and pegs hold it a little off flat). */
const FALL = 1.4;
/** In a private race only every RACE_KEEP-th vehicle stays on the road (a quarter of the traffic). */
const RACE_KEEP = 4;
/** Paint for the small cars and vans (their body material tinted, one shared material per paint): white the most
 * common, as on Kerala roads, then silver, red, blue, maroon, green, sand and the odd yellow. */
const PAINTS = TRAFFIC_PAINTS;
const PAINTABLE = /wagonr|omni/, BODY = /^(body|chassis_ok)/;
const tinted = new Map<string, MeshStandardMaterial>();
/* Advertising panels on the buses' sides, below the windows and above the wheels, as Kerala buses carry them
 * (data/sponsors.ts BUS_SIDES, handed out over the buses in turn; unsold: "Advertise on this bus"). 4 m × 0.6 m. */
const BUS = /bus|ksrtc/, AD = { length: .4, height: .06, y: .36, z: -.06 };
let adMaterials: MeshStandardMaterial[] | null = null;
function busAdMaterials() {
  if (adMaterials) return adMaterials;
  const loader = new TextureLoader();
  return (adMaterials = BUS_SIDES.map((sp) => {
    let map: Texture;
    if (sp?.image) { map = loader.load(sp.image); }
    else {
      const c = document.createElement('canvas'); c.width = 1400; c.height = 200;
      const g = c.getContext('2d')!;
      g.fillStyle = '#0e1f1a'; g.fillRect(0, 0, 1400, 200); g.fillStyle = '#d9a441'; g.fillRect(0, 0, 14, 200); g.fillRect(1386, 0, 14, 200);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#eef2ee'; g.font = "300 96px Fraunces, Georgia, serif"; g.fillText(ADVERTISE.bus, 700, 96);
      map = new CanvasTexture(c);
    }
    map.colorSpace = SRGBColorSpace; map.anisotropy = 4;
    return new MeshStandardMaterial({ map, roughness: .5 });
  }));
}
const adPanel = new PlaneGeometry(AD.length, AD.height);
const cache = new Map<string, Promise<Group | null>>();
function load(name: string) {
  if (!cache.has(name)) cache.set(name, loadVehicle(`/models/traffic/${name}.glb`, { merged: true }).catch(e => { console.warn(`Traffic asset unavailable: ${name}`, e); return null; }));
  return cache.get(name)!;
}
let assets: Promise<(Group | null)[]> | null = null;
const loadAssets = () => assets ??= Promise.all(VEHICLES.map(v => load(v.name)));
const widen = (t: number) => roadShapeAt(t).widen;
/** Where a vehicle drawn at `pose` would poke off the asphalt (giving way at its edge, a wide bus round a bend) or
 * into the bank (small mismatches between the baked terrain and the road cut): the nudge that puts it back — inward
 * toward the road's centre line and up over the ground — written into `out`. Vehicles used to be hidden in those
 * spots, which made them vanish and reappear as they came toward you. */
const corner = new Vector3(), centre = new Vector3(), inward = new Vector3(), tmpNudge = new Vector3();
function nudgeFor(curve: CatmullRomCurve3, v: Vehicle, pose: { position: Vector3; rotation: Quaternion }, out: Vector3) {
  const spec = VEHICLES[v.kind], L = curve.getLength();
  curve.getPointAt(Math.min(1, Math.max(0, v.distance / L)), centre);
  let off = 0, lift = 0;
  inward.set(0, 0, 0);
  for (const z of [-spec.length / 2, spec.length / 2]) for (const x of [-spec.width / 2, spec.width / 2]) {
    corner.set(x, .025, z).applyQuaternion(pose.rotation).add(pose.position);
    const over = roadDistance(corner.x, corner.z) - .39;
    if (over > off) { off = over; inward.set(centre.x - corner.x, 0, centre.z - corner.z).normalize(); }
    lift = Math.max(lift, height(corner.x, corner.z) - corner.y);
  }
  return out.copy(inward).multiplyScalar(off).setY(Math.min(lift, .12));
}
/** On the road, wheels out of the bank: whether a vehicle can stand at its edge here (giving way needs room). */
function footprintOk(curve: CatmullRomCurve3, v: Vehicle) {
  const spec = VEHICLES[v.kind], pose = vehiclePose(curve, v, widen);
  for (const z of [-spec.length / 2, spec.length / 2]) for (const x of [-spec.width / 2, spec.width / 2]) {
    const p = new Vector3(x, .025, z).applyQuaternion(pose.rotation).add(pose.position);
    if (roadDistance(p.x, p.z) > .39 || height(p.x, p.z) > p.y) return false;
  }
  return true;
}
export default function Traffic({ curve, small }: { curve: CatmullRomCurve3; small: boolean }) {
  const models = use(loadAssets()), last = useRef<number | null>(null);
  // a race in a private room (lib/net party): only one vehicle in RACE_KEEP stays on the road, so it's a race, not a jam
  const thin = useRef<{ on: boolean; live: Vehicle[]; keep: Set<Vehicle> | null }>({ on: false, live: [], keep: null });
  // a vehicle may give way only where it can stand at its edge, here and a little further on
  const fitsAtEdge = useMemo(() => (v: Vehicle) => edgeRoom(v.kind) > 0 && [0, .8, 1.6].every(d => footprintOk(curve, { ...v, distance: v.distance + d, shift: 1 })), [curve]);
  const zones = useMemo(() => passingZones(curve,widen),[curve]);
  const fleet = useMemo(() => {
    // busier by the towns (Lakkidi, Vythiri, Kalpetta…), thinner on the hairpins
    const L = curve.getLength(), bends = scrollState.bends.map(t => t * L), towns = [scrollState.arch, ...scrollState.places.map(p => p.t)].map(t => t * L);
    const result=createFleet(L, d => {
      let k = 1;
      for (const b of bends) k *= 1 - .55 * Math.exp(-(((d - b) / 2.5) ** 2));
      for (const t of towns) k += 1.2 * Math.exp(-(((d - t) / 12) ** 2));
      return k;
    });
    // Start outside reservation zones, so no initial opposing occupant can be trapped.
    for(const v of result)for(const z of zones)if(v.distance>z.from && v.distance<z.to)v.distance=v.direction===1?z.from-1:z.to+1;
    return result;
  }, [curve,zones]);
  const objects = useMemo(() => fleet.map(v => {
    const root = new Group(), source = models[v.kind];
    if (!source) return { root, lights: [] as MeshStandardMaterial[], owned: [] as MeshStandardMaterial[], people: null as Mesh | null, offset: new Vector3(), fresh: true, skip: 0, crew: null as Crew | null, seats: null as OccupiedSeat[] | null, bike: 0, wheels: [] as { spinner: Group; r: number }[], rolled: 0 };
    const model = source.clone(true), bounds = new Box3().setFromObject(model), size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
    const spec = VEHICLES[v.kind], scale = spec.length / size.z;
    // a bike without a rider in its file: a built one (sized before it, so the bike keeps its own proportions)
    if (RIDERLESS.test(spec.name)) addRider(model, JACKETS[v.id % JACKETS.length]);
    model.scale.set(spec.width / size.x, spec.height / size.y, scale); model.position.set(-center.x * spec.width / size.x, -bounds.min.y * spec.height / size.y, -center.z * scale);
    const lights: MeshStandardMaterial[] = [], owned: MeshStandardMaterial[] = [];
    model.traverse(o => { if (!(o instanceof Mesh)) return; o.castShadow = !small; o.receiveShadow = true;
      const adapt = (m: MeshStandardMaterial) => {
        if (PAINTABLE.test(spec.name) && BODY.test(m.name)) {
          const hex = PAINTS[(v.id * 7 + v.kind) % PAINTS.length], key = `${m.uuid}|${hex}`;
          let t = tinted.get(key);
          if (!t) { t = m.clone(); t.color.setHex(hex); tinted.set(key, t); }
          return t;
        }
        if (m.name === 'headlights') {
          const copy = m.clone(); owned.push(copy);
          copy.emissive.set(0xffe6a6); lights.push(copy);
          return copy;
        } return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(m => adapt(m as MeshStandardMaterial)) : adapt(o.material as MeshStandardMaterial);
    });
    // Shared geometry, tiny emissive lamps: no per-vehicle shadow lights.
    const bulb = new MeshStandardMaterial({ color: 0xffefce, emissive: 0xffdca0 }); owned.push(bulb); lights.push(bulb);
    // lamps at the model's own headlamp height (about a third of its height; bikes: one lamp, higher up)
    const bike = spec.width < .12;
    for (const x of bike ? [0] : [-spec.width*.32, spec.width*.32]) {
      const y = spec.height * (bike ? .62 : .32), z = frontAt(v.kind, model, x, y, spec.length * .5);
      const light=new Mesh(lampGeometry,bulb);light.name='lamp';light.position.set(x,y,z+.002);
      if (bike) light.scale.set(.45, .8, 1); // (one small round-ish lamp, not a car's)
      root.add(light);
    }
    // buses: a route board on the front — some in Malayalam, some English, some both
    if (hasBoard(spec.name)) {
      const board = destinationBoard(spec.name, (['ml', 'en', 'both'] as BoardText[])[Math.floor(v.id / 12) % 3], spec, model);
      owned.push(board.material as MeshStandardMaterial);
      if ((board.material as MeshStandardMaterial).emissiveMap) { board.material.userData.board = true; lights.push(board.material as MeshStandardMaterial); }
      root.add(board);
    }
    // the people inside (one merged mesh; drawn only near the camera, where the glass lets you see them)
    let people: Mesh | null = null;
    if (hasOccupants(spec.name)) {
      const geo = occupantsFor(spec.name, spec.length, v.id);
      if (geo) { people = new Mesh(geo, occupantMaterial); people.castShadow = false; people.receiveShadow = true; people.name = 'occupants'; root.add(people); }
    }
    // advertising on both sides of a bus (one sponsor per bus, in turn)
    if (BUS.test(spec.name)) {
      const mats = busAdMaterials(), mat = mats[v.id % mats.length];
      for (const side of [1, -1]) {
        const panel = new Mesh(adPanel, mat); panel.name = 'bus-ad';
        panel.position.set(side * (spec.width / 2 + .004), spec.height * AD.y, AD.z); panel.rotation.y = side * Math.PI / 2;
        root.add(panel);
      }
    }
    root.add(model); root.name = `traffic-${spec.name}-${v.id}`;
    // a riderless bike's wheels are cut out of its body (lib/bikeWheels) so they roll as it goes (the rider aside)
    let wheels: { spinner: Group; r: number }[] = [];
    if (RIDERLESS.test(spec.name)) {
      root.updateMatrixWorld(true);
      const parts: Mesh[] = []; model.traverse(o => { if ((o as Mesh).isMesh && o.name !== 'rider' && o.parent?.name !== 'rider') parts.push(o as Mesh); });
      const cut = cutBikeWheels(parts, root, spec.length);
      if (cut) {
        for (const m of parts) m.visible = false;
        for (const m of cut.rest) { m.castShadow = !small; }
        wheels = cut.wheels.map(w => { root.add(w.pivot); return { spinner: w.spinner, r: w.pivot.position.y }; });
      }
    }
    const seats = (people?.geometry.userData.seats as OccupiedSeat[] | undefined) ?? null;
    return { root, lights, owned, people, offset: new Vector3(), fresh: true, skip: 0, honked: false, crew: null as Crew | null, seats, bike: RIDERLESS.test(spec.name) ? spec.length : 0, wheels, rolled: v.distance };
  }), [fleet, models, small]);
  useEffect(() => () => { objects.forEach(o => o.owned.forEach(m => m.dispose())); }, [objects]);
  useEffect(() => { if (process.env.NODE_ENV !== 'production') (globalThis as { __trafficObjects?: unknown }).__trafficObjects = { objects, fleet }; }, [objects, fleet]);
  useFrame(({ camera }, dt) => frameTimed('traffic', () => {
    // where the viewer's seat is on this road (traffic runs on the churam/Kalpetta road only)
    const { act, progress } = scrollState, length = curve.getLength();
    const P = net.party, racing = game.active && !!P && P.mode === 'race' && (P.phase === 'countdown' || P.phase === 'race');
    if (racing !== thin.current.on || !thin.current.live.length) {
      const live = racing ? fleet.filter(v => v.id % RACE_KEEP === 0) : fleet;
      thin.current = { on: racing, live, keep: racing ? new Set(live) : null };
    }
    const live = thin.current.live, keep = thin.current.keep;
    trafficControl.fleet = live; trafficControl.curve = curve; // drive mode: the player's bus checks itself against these
    if (typeof window !== 'undefined') (window as unknown as { __wayanadTraffic?: unknown }).__wayanadTraffic = trafficControl; // for testing
    if (game.active) {
      // drive mode: the player's bus is a vehicle on this road (leg 0) — traffic brakes for it and gives way to it
      const onRoad = game.leg === 0 && game.phase === 'drive';
      const player: Player = { s: game.s, lat: game.lat, speed: game.speed, halfL: CAR.halfL, halfW: CAR.halfW };
      // in the way too: you on foot (standing in a lane stops it — wave one down), and your own car parked where you
      // left it when you took another (lib/game `parked`)
      const blocks: Obstacle[] = onRoad ? [{ distance: game.s, length: CAR.halfL * 2, lanes: playerLanes(player), speed: game.speed * Math.cos(game.psi) }] : [];
      if (onRoad && game.foot.on) blocks.push({ distance: game.foot.s, length: 0.06, lanes: playerLanes({ s: game.foot.s, lat: game.foot.lat, speed: 0, halfL: 0.03, halfW: 0.035 }), speed: 0, keep: 0.2 });
      const P0 = game.parked; if (onRoad && P0) blocks.push({ distance: P0.s, length: 0.4, lanes: playerLanes({ s: P0.s, lat: P0.lat, speed: 0, halfL: 0.2, halfW: 0.1 }), speed: 0 });
      if (!trafficControl.paused && !game.paused) frameTimed('traffic-sim', () => advanceTraffic(live, curve, dt * trafficControl.rate, weather.rain, zones, onRoad ? game.s : undefined, blocks));
      if (onRoad && !game.paused) frameTimed('traffic-player', () => { const horn = honking(); Object.assign(trafficControl, { horn }, interactWithPlayer(live, curve, widen, zones, player, Math.min(dt, .1), horn, fitsAtEdge)); });
    }
    const viewer = game.active ? undefined : act === 'churam' ? driveT(progress) * length : act === 'kalpetta' ? driveT2(progress) * length : undefined;
    if (!game.active && !trafficControl.paused) advanceTraffic(fleet, curve, dt * trafficControl.rate, weather.rain, zones, viewer);
    if (viewer !== undefined && trafficControl.stageAhead > 0) {
      // dev review: put the nearest uphill vehicle this far ahead of the seat, to stage a catch-up
      const v = fleet.filter(f => f.direction === 1).sort((a, b) => Math.abs(a.distance - viewer) - Math.abs(b.distance - viewer))[0];
      if (v) { v.distance = viewer + trafficControl.stageAhead; v.mode = trafficControl.stageMode; v.shift = v.mode === 'yield' ? 1 : 0; v.speed = .3; trafficControl.staged = v.id; }
      trafficControl.stageAhead = 0;
    }
    if (viewer !== undefined) {
      const seatSpeed = last.current === null ? 0 : (viewer - last.current) / Math.max(dt, 1e-3);
      const horn = honking();
      Object.assign(trafficControl, { seat: viewer, horn }, interactWithViewer(fleet, curve, widen, zones, viewer, seatSpeed, Math.min(dt, .1), horn, fitsAtEdge));
    }
    last.current = viewer ?? null;
    const st = trafficControl.staged >= 0 ? fleet.find(f => f.id === trafficControl.staged) : undefined; // dev review only
    if (st && viewer !== undefined) trafficControl.stagedInfo = `${st.id} ${st.mode} g=${(st.distance - viewer).toFixed(2)} sh=${(st.shift ?? 0).toFixed(2)} vis=${objects[fleet.indexOf(st)].root.visible}`;
    let visible = 0, aboard = 0;
    const crewing = { ...(small ? CREW.small : CREW.full) }; crewing.cap = Math.round(crewing.cap * quality.people); crewFrame(); // (fewer as the quality steps down)
    const dusk = duskness(), view = small ? 28 : 50, ease = 1 - Math.exp(-Math.min(dt, .1) / .12);
    const lit = weather.rain + weather.mist + weather.gloom + dusk > .08;
    for (let i = 0; i < fleet.length; i++) {
      const v = fleet[i], o = objects[i];
      if (keep && !keep.has(v)) { if (o.root.visible) { o.root.visible = false; o.fresh = true; } continue; } // off the road for the race
      // well out of range last time: look again only every dozen frames (nothing closes 15 units in a fifth of a
      // second), instead of working out its exact pose every frame for nothing — most of the fleet, most of the time
      if (o.skip > 0) { o.skip--; continue; }
      const pose = vehiclePose(curve, v, widen);
      o.root.userData.mode = v.mode ?? 'cruise'; // read by the dev review snapshot
      const far2 = camera.position.distanceToSquared(pose.position);
      // in range, with a margin both ways so a vehicle near the limit doesn't flicker in and out; and not at the ends
      // of the road, where the fleet wraps round from one end to the other
      const range = o.root.visible ? view + 4 : view;
      o.root.visible = far2 < range * range && v.distance > 3 && v.distance < length - 3;
      if (!o.root.visible) {
        o.fresh = true; if (o.people) o.people.visible = false;
        if (o.crew) { disembark(o.crew, o.root); o.crew = null; }
        if (far2 > (view + 15) ** 2) o.skip = 12;
        continue;
      }
      // kept on the asphalt and out of the bank (eased, so the nudge itself never jumps)
      o.offset.lerp(nudgeFor(curve, v, pose, tmpNudge), o.fresh ? 1 : ease); o.fresh = false;
      o.root.position.copy(pose.position).add(o.offset); o.root.quaternion.copy(pose.rotation);
      // a knocked-over bike: tipped about its tyres' line onto its side, away from you (falls like a weight: slow, then
      // fast; gets up smoothly). Local +x is the vehicle's right, which is the road's −direction side
      if (v.fall) {
        const f = v.fall, k = (v.down ?? 0) > 0 ? f * f : f * f * (3 - 2 * f);
        o.root.rotateZ(FALL * k * (v.fallSide ?? 1) * v.direction);
      }
      // jolted by a hard hit: the tail knocked aside and wobbling back, a hop off the bump; the driver leans on the horn
      const jt = v.joltT;
      if (jt !== undefined && jt < 2.5) {
        const kick = v.joltKick ?? 0;
        o.root.rotateY(kick * 0.3 * (v.joltSide ?? 1) * Math.exp(-jt * 2.2) * Math.cos(jt * 6));
        o.root.position.y += kick * 0.025 * Math.max(0, Math.sin(jt * 16)) * Math.exp(-jt * 7);
        if (!o.honked && jt > 0.35) { o.honked = true; honk({ audible: true, preview: true, kind: /bus|truck|lorry/i.test(VEHICLES[v.kind].name) ? 'bus' : 'car' }); }
      } else if (o.honked && !((v.jolt ?? 0) > 0)) o.honked = false;
      visible++;
      // its wheels roll with the road it covers (its own way along it)
      if (o.wheels.length) { const d = (v.distance - o.rolled) * v.direction; o.rolled = v.distance; if (Math.abs(d) < 1) for (const w of o.wheels) w.spinner.rotation.x += d / Math.max(0.01, w.r); }
      // up close, real people aboard (lib/crew), the nearest vehicles first come first served; else the built ones
      const isBus = BUS.test(VEHICLES[v.kind].name);
      if ((o.seats || o.bike) && far2 < (isBus ? crewing.busNear : crewing.near) ** 2 && aboard < crewing.cap) {
        o.crew = board(o.crew, o.root, v.id, o.seats, o.bike || null, BUS.test(VEHICLES[v.kind].name) ? crewing.bus : 8);
        aboard += o.crew.people.length;
        poseCrew(o.crew, o.root, dt, !!o.bike);
      } else if (o.crew) { disembark(o.crew, o.root); o.crew = null; }
      if (o.people) o.people.visible = far2 < 14 ** 2 && !o.crew?.done; // people inside only where you could see them
      // lamps glow in mist and rain; LED route boards are lit all day, a little brighter in the murk
      // stopped after a hit: every lamp blinking, like hazards
      const hazard = (v.jolt ?? 0) > 0 && Math.floor((v.joltT ?? 0) * 2.6) % 2 === 0;
      for (const light of o.lights) light.emissiveIntensity = light.userData.board ? .55 + (weather.rain + weather.mist + dusk) * .35 : hazard ? 3 : .1 + weather.rain * 2 + weather.mist + dusk * 1.6;
      // the little lamp quads only when they're lit (rain, mist, a dark sky, hazards): in daylight they were two draw
      // calls a vehicle for a glow nobody could see
      for (const c of o.root.children) if (c.name === 'lamp') c.visible = lit || hazard;
    }
    trafficControl.count = visible; perfStats.people.crew = aboard;
  }));
  return <group name="mountain-traffic" dispose={null}>{objects.map((o,i) => <primitive key={i} object={o.root} />)}</group>;
}
