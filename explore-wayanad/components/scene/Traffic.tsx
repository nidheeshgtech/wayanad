'use client';
import { use, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, BoxGeometry, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { destinationBoard, hasBoard, loadVehicle, type BoardText } from '@/lib/vehicleAssets';
import { height, roadDistance, roadShapeAt } from '@/lib/terrain';
import { advanceTraffic, createFleet, edgeRoom, interactWithPlayer, interactWithViewer, passingZones, playerLanes, trafficControl, VEHICLES, vehiclePose, type Player, type Vehicle } from '@/lib/traffic';
import { BUS, game } from '@/lib/game';
import { honking } from '@/lib/horn';
import { driveT, driveT2 } from '@/lib/drive';
import { scrollState } from '@/lib/scrollState';
import { weather } from '@/lib/weather';
const lampGeometry = new BoxGeometry(.025,.013,.005);
const cache = new Map<string, Promise<Group | null>>();
function load(name: string) {
  if (!cache.has(name)) cache.set(name, loadVehicle(`/models/traffic/${name}.glb`).catch(e => { console.warn(`Traffic asset unavailable: ${name}`, e); return null; }));
  return cache.get(name)!;
}
let assets: Promise<(Group | null)[]> | null = null;
const loadAssets = () => assets ??= Promise.all(VEHICLES.map(v => load(v.name)));
const widen = (t: number) => roadShapeAt(t).widen;
/** On the road, wheels out of the bank: the check Traffic uses to hide unsafe vehicles, for a pose. */
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
    const result=createFleet(curve.getLength());
    // Start outside reservation zones, so no initial opposing occupant can be trapped.
    for(const v of result)for(const z of zones)if(v.distance>z.from && v.distance<z.to)v.distance=v.direction===1?z.from-1:z.to+1;
    return result;
  }, [curve,zones]);
  const objects = useMemo(() => fleet.map(v => {
    const root = new Group(), source = models[v.kind];
    if (!source) return { root, lights: [] as MeshStandardMaterial[], owned: [] as MeshStandardMaterial[] };
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
      const light=new Mesh(lampGeometry,bulb);light.position.set(x,spec.height*(bike ? .62 : .32),spec.length*.5+.002);root.add(light);
    }
    // buses: a route board on the front — some in Malayalam, some English, some both
    if (hasBoard(spec.name)) {
      const board = destinationBoard(spec.name, (['ml', 'en', 'both'] as BoardText[])[Math.floor(v.id / 12) % 3], spec, model);
      owned.push(board.material as MeshStandardMaterial);
      if ((board.material as MeshStandardMaterial).emissiveMap) { board.material.userData.board = true; lights.push(board.material as MeshStandardMaterial); }
      root.add(board);
    }
    root.add(model); root.name = `traffic-${spec.name}-${v.id}`;
    return { root, lights, owned };
  }), [fleet, models, small]);
  useEffect(() => () => { objects.forEach(o => o.owned.forEach(m => m.dispose())); }, [objects]);
  useFrame(({ camera }, dt) => {
    // where the viewer's seat is on this road (traffic runs on the churam/Kalpetta road only)
    const { act, progress } = scrollState, length = curve.getLength();
    trafficControl.fleet = fleet; trafficControl.curve = curve; // drive mode: the player's bus checks itself against these
    if (game.active) {
      // drive mode: the player's bus is a vehicle on this road (leg 0) — traffic brakes for it and gives way to it
      const onRoad = game.leg === 0 && game.phase === 'drive';
      const player: Player = { s: game.s, lat: game.lat, speed: game.speed, halfL: BUS.halfL, halfW: BUS.halfW };
      if (!trafficControl.paused) advanceTraffic(fleet, curve, dt * trafficControl.rate, weather.rain, zones, onRoad ? game.s : undefined,
        onRoad ? [{ distance: game.s, length: BUS.halfL * 2, lanes: playerLanes(player) }] : []);
      if (onRoad) { const horn = honking(); Object.assign(trafficControl, { horn }, interactWithPlayer(fleet, curve, widen, zones, player, Math.min(dt, .1), horn, fitsAtEdge)); }
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
    for (let i = 0; i < fleet.length; i++) {
      const v = fleet[i], o = objects[i], pose = vehiclePose(curve, v, widen);
      o.root.position.copy(pose.position); o.root.quaternion.copy(pose.rotation);
      o.root.userData.mode = v.mode ?? 'cruise'; // read by the dev review snapshot
      o.root.visible = camera.position.distanceToSquared(pose.position) < (small ? 28 : 50) ** 2 && v.distance > 3 && v.distance < curve.getLength() - 3;
      // Existing baked terrain has isolated cut mismatches: conservatively omit unsafe footprints.
      if (o.root.visible && !footprintOk(curve, v)) o.root.visible = false;
      if (o.root.visible) visible++;
      // lamps glow in mist and rain; LED route boards are lit all day, a little brighter in the murk
      for (const light of o.lights) light.emissiveIntensity = light.userData.board ? .55 + (weather.rain + weather.mist) * .35 : .1 + weather.rain * 2 + weather.mist;
    }
    trafficControl.count = visible;
  });
  return <group name="mountain-traffic" dispose={null}>{objects.map((o,i) => <primitive key={i} object={o.root} />)}</group>;
}
