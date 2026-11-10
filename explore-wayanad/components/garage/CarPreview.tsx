"use client";
import { Suspense, use, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Box3, Group, Vector3, type Object3D } from "three";
import { paintCar, paintedCar } from "@/lib/carModel";
import { loadVehicle } from "@/lib/vehicleAssets";
import { carOf, type Choice } from "@/data/cars";
import DriverModel from "./DriverModel";

/** The chosen car turning slowly on a dark floor, in its paint (lib/carModel). Its own small canvas, loaded lazily by
 * CarPicker so the title screen's first download doesn't carry the 3D engine. */
function Turntable({ choice, still, raw, driver }: { choice: Choice; still?: number; raw?: boolean; driver?: boolean }) {
  // raw (dev review): the unmerged model, so a click can name the part under it
  const source = use(raw ? loadVehicle(carOf(choice.car).file) : paintedCar(choice)), turn = useRef<Group>(null);
  const model = useMemo(() => {
    const m = raw ? paintCar(source.clone(true), "#eceeec") : source.clone(true), box = new Box3().setFromObject(m), size = box.getSize(new Vector3());
    const k = (2.6 * carOf(choice.car).length / 4) / size.z; // a 4 m car 2.6 units long fills the view; longer ones a little more
    m.scale.setScalar(k); const b = new Box3().setFromObject(m), c = b.getCenter(new Vector3());
    m.position.set(-c.x, -b.min.y, -c.z);
    return m;
  }, [source, choice.car]);
  useFrame((_, dt) => { if (turn.current && still === undefined) turn.current.rotation.y += dt * 0.45; });
  // the driver stands still in front, off to one side and facing you, while the car turns behind them: clear of the
  // car's sweep (its half-length, in the preview's units), whatever it is
  const reach = Math.max(1.25, (2.6 * carOf(choice.car).length / 4) / 2 + 0.25), at: [number, number, number] = [0.42 * reach, 0, 0.92 * reach];
  return (<>
    {driver && <Suspense fallback={null}><DriverModel id={choice.driver} unit={2.6 / 4} position={at} rotation={[0, Math.atan2(3.9 - at[0], 3.9 - at[2]) - 0.25, 0]} /></Suspense>}
    <group ref={turn} rotation={[0, still ?? -0.7, 0]}>
      <primitive object={model} onPointerDown={raw ? (e: { object: Object3D; point: Vector3; stopPropagation: () => void }) => { e.stopPropagation();
        // the part's name and where on the model you clicked (the model file's own coordinates)
        const path: string[] = []; for (let o: Object3D | null = e.object; o && path.length < 4; o = o.parent) path.push(o.name);
        const at = model.worldToLocal(e.point.clone()).toArray().map((v) => +v.toFixed(3));
        ((window as unknown as { __picks: unknown[] }).__picks ??= []).push({ path: path.join(" < "), at }); } : undefined} />
    </group>
  </>);
}

/** `still`: a fixed turn (radians) instead of turning — the dev review page (app/dev/car) shows fronts and backs. */
/** `driver`: your driver stands beside it (the car sheet's big preview; the small thumbnails leave them out). */
export default function CarPreview({ choice, still, raw, driver }: { choice: Choice; still?: number; raw?: boolean; driver?: boolean }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: still !== undefined ? [0, 0.9, 3.2] : driver ? [3.9, 1.6, 4.2] : [3.4, 1.5, 3.4], fov: 32 }} onCreated={({ camera }) => camera.lookAt(0, 0.55, 0)} gl={{ antialias: true, alpha: true }}>
      <hemisphereLight args={[0xdfe8ef, 0x1b2a22, 1.4]} />
      <directionalLight position={[4, 6, 3]} intensity={2.4} />
      <directionalLight position={[-5, 3, -4]} intensity={0.8} color={0xbcd0ff} />
      {driver && <directionalLight position={[2.5, 2.2, 5]} intensity={1.3} color={0xfff1dc} />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}><circleGeometry args={[2.6, 48]} /><meshStandardMaterial color={0x16241e} roughness={0.9} /></mesh>
      <Suspense fallback={null}><Turntable choice={choice} still={still} raw={raw} driver={driver} /></Suspense>
    </Canvas>
  );
}
