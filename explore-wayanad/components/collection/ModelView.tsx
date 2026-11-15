"use client";
import { Suspense, use, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Box3, Group, Vector3, type Object3D } from "three";
import { prepareVehicle } from "@/lib/carModel";
import { label, lightBar, redCross } from "@/lib/emergency";
import { AMBULANCE, POLICE, VEHICLES } from "@/lib/traffic";
import { loadVehicle, mergeByMaterial } from "@/lib/vehicleAssets";
import { carOf } from "@/data/cars";
import type { Entry } from "@/data/collection";

/** A collection vehicle as a model: a game car painted as in the game (lib/carModel), or a plain model file. Cached. */
const cache = new Map<string, Promise<Object3D>>();
function modelOf(e: Entry) {
  if (!cache.has(e.id)) cache.set(e.id, e.car
    ? loadVehicle(carOf(e.car).file).then((src) => {
      const m = mergeByMaterial(prepareVehicle(src.clone(true), carOf(e.car!), e.paint ?? "#eceeec") as Group);
      return e.car === "t-police" || e.car === "t-amb" ? emergency(m, e.car === "t-police") : m;
    })
    : loadVehicle(e.file!, { merged: true }));
  return cache.get(e.id)!;
}

/** The police jeep and the ambulance dressed as on the road (components/scene/Traffic): the light bar, the lettering,
 * the red crosses — placed at the traffic's size, then the whole scaled with the rest. The bar flashes (userData.flash). */
function emergency(m: Group, police: boolean) {
  const spec = VEHICLES[police ? POLICE : AMBULANCE], root = new Group();
  const size = new Box3().setFromObject(m).getSize(new Vector3()), k = spec.length / size.z;
  m.scale.setScalar(k); const b = new Box3().setFromObject(m), c = b.getCenter(new Vector3());
  m.position.set(-c.x, -b.min.y, -c.z); root.add(m);
  const lb = lightBar(police ? 0.12 : 0.1, 0.26);
  lb.bar.position.set(0, spec.height + 0.004, police ? -0.02 : 0.04); root.add(lb.bar);
  for (const side of [-1, 1]) {
    const tag = police ? label("KERALA POLICE", 0.2, 0.03, "#1b3f9c", null) : label("AMBULANCE", 0.2, 0.032, "#d81e1e", null);
    tag.position.set(side * (spec.width / 2 + 0.003), police ? 0.085 : 0.1, police ? -0.02 : 0.02); tag.rotation.y = side * Math.PI / 2; root.add(tag);
    if (!police) { const cross = redCross(0.045); cross.position.set(side * (spec.width / 2 + 0.003), 0.1, -0.12); cross.rotation.y = side * Math.PI / 2; root.add(cross); }
  }
  if (!police) {
    const front = label("AMBULANCE", 0.13, 0.022, "#d81e1e", null, undefined, true); front.position.set(0, 0.118, spec.length / 2 + 0.004); root.add(front);
    const back = redCross(0.05); back.position.set(0, 0.11, -spec.length / 2 - 0.004); back.rotation.y = Math.PI; root.add(back);
  }
  root.userData.flash = lb.flash;
  return root;
}

function Turntable({ entry, still }: { entry: Entry; still?: number }) {
  const source = use(modelOf(entry)), turn = useRef<Group>(null);
  const model = useMemo(() => {
    const m = source.clone(true), size = new Box3().setFromObject(m).getSize(new Vector3());
    // every vehicle the same size on screen (a bus would otherwise be a speck beside a bike): its longest side 2.6
    const k = 2.6 / Math.max(size.x, size.z);
    m.scale.setScalar(k); const b = new Box3().setFromObject(m), c = b.getCenter(new Vector3());
    m.position.set(-c.x, -b.min.y, -c.z);
    return m;
  }, [source]);
  useFrame(({ clock }, dt) => {
    if (turn.current && still === undefined) turn.current.rotation.y += dt * 0.6;
    (source.userData.flash as ((t: number, on?: boolean) => void) | undefined)?.(still === undefined ? clock.elapsedTime : 0.1, true);
  });
  return <group ref={turn} rotation={[0, still ?? -0.7, 0]}><primitive object={model} /></group>;
}

/** The vehicle on a dark glass floor with a gold rim light; `still`: a fixed angle (the card pictures), else turning. */
export default function ModelView({ entry, still, onReady }: { entry: Entry; still?: number; onReady?: (canvas: HTMLCanvasElement) => void }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [3.3, 1.45, 3.3], fov: 32 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: !!onReady }}
      onCreated={({ camera, gl }) => { camera.lookAt(0, 0.5, 0); if (onReady) setTimeout(() => onReady(gl.domElement), 1200); }}>
      <hemisphereLight args={[0xdfe8ef, 0x1b2a22, 1.5]} />
      <directionalLight position={[4, 6, 3]} intensity={2.4} />
      <directionalLight position={[-5, 3, -4]} intensity={1.1} color={0xffd36b} />
      <directionalLight position={[-3, 2, 5]} intensity={0.6} color={0x7fe8dc} />
      <Suspense fallback={null}><Turntable entry={entry} still={still} /></Suspense>
    </Canvas>
  );
}
