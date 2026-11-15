"use client";
import { Suspense, use, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Box3, PCFSoftShadowMap, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3 } from "three";
import { modelOf } from "./ModelView";
import type { Entry } from "@/data/collection";

/**
 * Development only (app/dev/thumbs): a collection vehicle parked in a bay of a car park on the churam — asphalt, white
 * bay lines, the forest behind — lit by a low sun with real shadows, shot from high at three-quarters, as vehicle
 * sites photograph them. Rendered to the card pictures (public/cars/*.webp).
 */
function Car({ entry }: { entry: Entry }) {
  const source = use(modelOf(entry));
  const model = useMemo(() => {
    const m = source.clone(true), size = new Box3().setFromObject(m).getSize(new Vector3());
    const k = 2.6 / Math.max(size.x, size.z); m.scale.setScalar(k);
    const b = new Box3().setFromObject(m), c = b.getCenter(new Vector3()); m.position.set(-c.x, -b.min.y, -c.z);
    m.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    return m;
  }, [source]);
  return <group rotation={[0, -0.75, 0]}><primitive object={model} /></group>; // (turned about the bay's centre, not its own offset origin)
}

function Lot() {
  const [asphalt, back] = useLoader(TextureLoader, ["/textures/asphalt-color.webp", "/dev-backdrop.webp"]);
  asphalt.wrapS = asphalt.wrapT = RepeatWrapping; asphalt.repeat.set(6, 6); asphalt.colorSpace = SRGBColorSpace; back.colorSpace = SRGBColorSpace;
  const lines = [-3.3, -1.1, 1.1, 3.3];
  return (<group rotation={[0, -0.75, 0]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[30, 30]} /><meshStandardMaterial map={asphalt} color={0x9a9a96} roughness={0.95} /></mesh>
    {lines.map((x) => <mesh key={x} position={[x, 0.004, -0.2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[0.07, 4.6]} /><meshStandardMaterial color={0xf2f2ee} roughness={0.8} /></mesh>)}
    <mesh position={[0, 0.004, -2.5]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[6.67, 0.07]} /><meshStandardMaterial color={0xf2f2ee} roughness={0.8} /></mesh>
    <mesh position={[0, 2.2, -8]} rotation={[0, 0.75, 0]}><planeGeometry args={[30, 7.9]} /><meshBasicMaterial map={back} toneMapped={false} /></mesh>
  </group>);
}

export default function LotShot({ entry }: { entry: Entry }) {
  return (
    <Canvas dpr={2} shadows={{ type: PCFSoftShadowMap }} camera={{ position: [0.35, 2.45, 4.6], fov: 31 }} gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ camera, scene }) => { camera.lookAt(0.05, 0.5, -0.2); scene.background = null; }}>
      <color attach="background" args={[0x9fb8c8]} />
      <hemisphereLight args={[0xdfeaf2, 0x3a3a30, 1.15]} />
      <directionalLight position={[-4, 7, 3]} intensity={2.6} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5} />
      <directionalLight position={[5, 3, 5]} intensity={0.5} color={0xfff1dc} />
      <Suspense fallback={null}><Lot /><Car entry={entry} /></Suspense>
    </Canvas>
  );
}
