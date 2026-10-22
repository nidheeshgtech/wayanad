'use client';
import { use, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, BoxGeometry, CanvasTexture, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Texture, TextureLoader, Vector3 } from 'three';
import { destinationBoard, hasBoard, loadVehicle, type BoardText } from '@/lib/vehicleAssets';
import { height, roadDistance, roadShapeAt } from '@/lib/terrain';
import { advanceTraffic, createFleet, edgeRoom, interactWithPlayer, interactWithViewer, passingZones, playerLanes, trafficControl, VEHICLES, vehiclePose, type Player, type Vehicle } from '@/lib/traffic';
import { CAR, game } from '@/lib/game';
import { honking } from '@/lib/horn';
import { driveT, driveT2 } from '@/lib/drive';
import { scrollState } from '@/lib/scrollState';
import { weather } from '@/lib/weather';
import { duskness } from '@/lib/theme';
import { frameTimed } from '@/lib/perf';
import { hasOccupants, occupantMaterial, occupantsFor } from '@/lib/occupants';
import { ADVERTISE, BUS_SIDES } from '@/data/sponsors';
const lampGeometry = new BoxGeometry(.025,.013,.005);
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
    if (!source) return { root, lights: [] as MeshStandardMaterial[], owned: [] as MeshStandardMaterial[], people: null as Mesh | null, offset: new Vector3(), fresh: true };
    const model = source.clone(true), bounds = new Box3().setFromObject(model), size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
    const spec = VEHICLES[v.kind], scale = spec.length / size.z;
    model.scale.set(spec.width / size.x, spec.height / size.y, scale); model.position.set(-center.x * spec.width / size.x, -bounds.min.y * spec.height / size.y, -center.z * scale);
    const lights: MeshStandardMaterial[] = [], owned: MeshStandardMaterial[] = [];
    model.traverse(o => { if (!(o instanceof Mesh)) return; o.castShadow = !small; o.receiveShadow = true;
      const adapt = (m: MeshStandardMaterial) => {
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
      const light=new Mesh(lampGeometry,bulb);light.name='lamp';light.position.set(x,spec.height*(bike ? .62 : .32),spec.length*.5+.002);root.add(light);
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
    return { root, lights, owned, people, offset: new Vector3(), fresh: true };
  }), [fleet, models, small]);
  useEffect(() => () => { objects.forEach(o => o.owned.forEach(m => m.dispose())); }, [objects]);
  useFrame(({ camera }, dt) => frameTimed('traffic', () => {
    // where the viewer's seat is on this road (traffic runs on the churam/Kalpetta road only)
    const { act, progress } = scrollState, length = curve.getLength();
    trafficControl.fleet = fleet; trafficControl.curve = curve; // drive mode: the player's bus checks itself against these
    if (game.active) {
      // drive mode: the player's bus is a vehicle on this road (leg 0) — traffic brakes for it and gives way to it
      const onRoad = game.leg === 0 && game.phase === 'drive';
      const player: Player = { s: game.s, lat: game.lat, speed: game.speed, halfL: CAR.halfL, halfW: CAR.halfW };
      if (!trafficControl.paused && !game.paused) advanceTraffic(fleet, curve, dt * trafficControl.rate, weather.rain, zones, onRoad ? game.s : undefined,
        onRoad ? [{ distance: game.s, length: CAR.halfL * 2, lanes: playerLanes(player) }] : []);
      if (onRoad && !game.paused) { const horn = honking(); Object.assign(trafficControl, { horn }, interactWithPlayer(fleet, curve, widen, zones, player, Math.min(dt, .1), horn, fitsAtEdge)); }
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
    let visible = 0;
    const dusk = duskness(), view = small ? 28 : 50, ease = 1 - Math.exp(-Math.min(dt, .1) / .12);
    for (let i = 0; i < fleet.length; i++) {
      const v = fleet[i], o = objects[i], pose = vehiclePose(curve, v, widen);
      o.root.userData.mode = v.mode ?? 'cruise'; // read by the dev review snapshot
      const far2 = camera.position.distanceToSquared(pose.position);
      // in range, with a margin both ways so a vehicle near the limit doesn't flicker in and out; and not at the ends
      // of the road, where the fleet wraps round from one end to the other
      const range = o.root.visible ? view + 4 : view;
      o.root.visible = far2 < range * range && v.distance > 3 && v.distance < length - 3;
      if (o.root.visible) {
        // kept on the asphalt and out of the bank (eased, so the nudge itself never jumps)
        o.offset.lerp(nudgeFor(curve, v, pose, tmpNudge), o.fresh ? 1 : ease); o.fresh = false;
        o.root.position.copy(pose.position).add(o.offset); o.root.quaternion.copy(pose.rotation);
        visible++;
      } else o.fresh = true;
      if (o.people) o.people.visible = far2 < 14 ** 2; // people inside only where you could see them
      // lamps glow in mist and rain; LED route boards are lit all day, a little brighter in the murk
      for (const light of o.lights) light.emissiveIntensity = light.userData.board ? .55 + (weather.rain + weather.mist + dusk) * .35 : .1 + weather.rain * 2 + weather.mist + dusk * 1.6;
      // the little lamp quads only when they're lit (rain, mist, a dark sky): in daylight they were two draw calls a
      // vehicle for a glow nobody could see
      if (o.root.visible) { const lit = weather.rain + weather.mist + weather.gloom + dusk > .08; for (const c of o.root.children) if (c.name === 'lamp') c.visible = lit; }
    }
    trafficControl.count = visible;
  }));
  return <group name="mountain-traffic" dispose={null}>{objects.map((o,i) => <primitive key={i} object={o.root} />)}</group>;
}
