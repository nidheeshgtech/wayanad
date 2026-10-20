'use client';
import { use, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box3, BoxGeometry, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { height, roadDistance, roadShapeAt } from '@/lib/terrain';
import { advanceTraffic, createFleet, passingZones, trafficControl, VEHICLES, vehiclePose } from '@/lib/traffic';
import { weather } from '@/lib/weather';
const lampGeometry = new BoxGeometry(.025,.013,.005);
const cache = new Map<string, Promise<Group | null>>();
function load(name: string) {
  if (!cache.has(name)) cache.set(name, new GLTFLoader().loadAsync(`/models/traffic/${name}.glb`).then(g => g.scene).catch(e => { console.warn(`Traffic asset unavailable: ${name}`, e); return null; }));
  return cache.get(name)!;
}
let assets: Promise<(Group | null)[]> | null = null;
const loadAssets = () => assets ??= Promise.all(VEHICLES.map(v => load(v.name)));
const widen = (t: number) => roadShapeAt(t).widen;
export default function Traffic({ curve, small }: { curve: CatmullRomCurve3; small: boolean }) {
  const models = use(loadAssets());
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
        if (m.name === 'headlights' || (spec.name === 'bus' && (m.name === 'body' || m.name === 'livery'))) {
          const copy = m.clone(); owned.push(copy);
          if (m.name === 'headlights') { copy.emissive.set(0xffe6a6); lights.push(copy); }
          else if (Math.floor(v.id / 12) % 3 === 1) copy.color.set(m.name === 'body' ? 0x426e54 : 0xe4ddbd);
          return copy;
        } return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(m => adapt(m as MeshStandardMaterial)) : adapt(o.material as MeshStandardMaterial);
    });
    // Shared geometry, tiny emissive lamps: no per-vehicle shadow lights.
    const bulb = new MeshStandardMaterial({ color: 0xffefce, emissive: 0xffdca0 }); owned.push(bulb); lights.push(bulb);
    for (const x of [-spec.width*.32, spec.width*.32]) {
      const light=new Mesh(lampGeometry,bulb);light.position.set(x,.065,spec.length*.5+.002);root.add(light);
    }
    root.add(model); root.name = `traffic-${spec.name}-${v.id}`;
    return { root, lights, owned };
  }), [fleet, models, small]);
  useEffect(() => () => { objects.forEach(o => o.owned.forEach(m => m.dispose())); }, [objects]);
  useFrame(({ camera }, dt) => {
    if (!trafficControl.paused) advanceTraffic(fleet, curve, dt * trafficControl.rate, weather.rain, zones);
    let visible = 0;
    for (let i = 0; i < fleet.length; i++) {
      const v = fleet[i], o = objects[i], pose = vehiclePose(curve, v, widen);
      o.root.position.copy(pose.position); o.root.quaternion.copy(pose.rotation);
      o.root.visible = camera.position.distanceToSquared(pose.position) < (small ? 28 : 50) ** 2 && v.distance > 3 && v.distance < curve.getLength() - 3;
      // Existing baked terrain has isolated cut mismatches: conservatively omit unsafe footprints.
      if (o.root.visible) {
        const spec=VEHICLES[v.kind];
        for(const z of [-spec.length/2,spec.length/2]) for(const x of [-spec.width/2,spec.width/2]) {
          const p=new Vector3(x,.025,z).applyQuaternion(pose.rotation).add(pose.position);
          if (roadDistance(p.x,p.z)>.39 || height(p.x,p.z)>p.y) o.root.visible=false;
        }
      }
      if (o.root.visible) visible++;
      for (const light of o.lights) light.emissiveIntensity = .1 + weather.rain * 2 + weather.mist;
    }
    trafficControl.count = visible;
  });
  return <group name="mountain-traffic" dispose={null}>{objects.map((o,i) => <primitive key={i} object={o.root} />)}</group>;
}
