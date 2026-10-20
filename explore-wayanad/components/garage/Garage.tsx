"use client";
import { Suspense, use, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, View } from "@react-three/drei";
import { Box3, CircleGeometry, Group, PMREMGenerator, Sphere, Texture, Vector3 } from "three";
import { destinationBoard, hasBoard, loadVehicle } from "@/lib/vehicleAssets";
import { hasOccupants, occupantMaterial, occupantsFor } from "@/lib/occupants";
import { Mesh } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { VEHICLE_REGISTRY, type VehicleEntry } from "@/data/vehicles";
import { BUILDERS } from "@/lib/keralaVehicles";
import styles from "./Garage.module.scss";

/** The vehicle as a Group in metres: a GLB scaled to its registry size, or a built one as built. */
function useVehicle(v: VehicleEntry) {
  const loaded = v.kind === "model" ? use(loadVehicle(v.source, { merged: !v.source.includes("player") })) : null;
  return useMemo(() => {
    const g = loaded ? loaded.clone(true) : BUILDERS[v.source]();
    if (loaded) {
      const turn = new Group(); turn.rotation.y = v.yaw ?? 0; turn.add(g); turn.updateMatrixWorld(true);
      // same normalisation as the traffic: stretch the model's box to the vehicle's size (real models: even scale by length)
      const b = new Box3().setFromObject(turn), s = b.getSize(new Vector3()), c = b.getCenter(new Vector3());
      const k = v.fit === "uniform" ? new Vector3().setScalar(v.size.length / s.z) : new Vector3(v.size.width / s.x, v.size.height / s.y, v.size.length / s.z);
      const wrap = new Group(); wrap.add(turn);
      wrap.scale.copy(k); wrap.position.set(-c.x * k.x, -b.min.y * k.y, -c.z * k.z);
      const out = new Group(); out.add(wrap);
      const name = v.source.split("/").pop()!.replace(".glb", "");
      if (hasBoard(name)) out.add(destinationBoard(name, "both", v.size, wrap));
      if (hasOccupants(name)) { const geo = occupantsFor(name, v.size.length, 7); if (geo) out.add(new Mesh(geo, occupantMaterial)); }
      return out;
    }
    return g;
  }, [loaded, v]);
}

const FOV = 35, LOOK = new Vector3(0.78, 0.32, 0.92).normalize(); // three-quarter front, a little above

function Turntable({ v, spin }: { v: VehicleEntry; spin: boolean }) {
  const vehicle = useVehicle(v), turn = useRef<Group>(null), camera = useThree((s) => s.camera);
  useFrame((_, dt) => { if (spin && turn.current) turn.current.rotation.y += dt * 0.35; });
  // frame every vehicle the same way: the camera backs off until the model's bounding sphere fills the view
  const sphere = useMemo(() => new Box3().setFromObject(vehicle).getBoundingSphere(new Sphere()), [vehicle]);
  const reach = sphere.radius, dist = reach / Math.sin((FOV * Math.PI) / 360) * 1.02;
  useLayoutEffect(() => { camera.position.copy(LOOK).multiplyScalar(dist).add(sphere.center); camera.lookAt(sphere.center); }, [camera, dist, sphere]);
  const floor = useMemo(() => new CircleGeometry(reach * 1.15, 64), [reach]);
  return (
    <>
      <group ref={turn}><primitive object={vehicle} /></group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow geometry={floor}>
        <meshStandardMaterial color={0x56645d} roughness={0.95} />
      </mesh>
      <directionalLight position={[reach * 1.2, reach * 2.4, reach * 1.6]} intensity={2.6} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-reach * 1.4} shadow-camera-right={reach * 1.4} shadow-camera-top={reach * 1.4} shadow-camera-bottom={-reach * 1.4} shadow-camera-far={reach * 8} />
      <hemisphereLight args={[0xeef3f6, 0x3a443e, 1.1]} />
      <OrbitControls makeDefault enablePan={false} minDistance={dist * 0.45} maxDistance={dist * 2.2} target={sphere.center.toArray()} />
    </>
  );
}

/** Image-based lighting from three's RoomEnvironment (no download): rendered once, set on each view's own scene. */
let studio: Texture | null = null;
function Studio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    studio ??= new PMREMGenerator(gl).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = studio; scene.environmentIntensity = 1.1;
  }, [gl, scene]);
  return null;
}

function Card({ v, still }: { v: VehicleEntry; still: boolean }) {
  const [spin, setSpin] = useState(!still);
  return (
    <article className={styles.card}>
      {/* the view is drawn into this box; grabbing it stops the turntable so you can look around */}
      <div className={styles.viewBox} onPointerDown={() => setSpin(false)}>
      <View className={styles.view}>
        <color attach="background" args={["#3b4a44"]} />
        <PerspectiveCamera makeDefault fov={FOV} near={0.05} far={200} />
        <Studio />
        <Suspense fallback={null}>
          <Turntable v={v} spin={spin} />
        </Suspense>
      </View>
      </div>
      <div className={styles.meta}>
        <div className={styles.head}>
          <h2>{v.label}</h2>
          <span className={v.inTraffic ? styles.live : styles.new}>{v.inTraffic ? "In traffic" : "New · not in traffic"}</span>
        </div>
        <p className={styles.note}>{v.note}</p>
        <dl className={styles.facts}>
          <div><dt>Size</dt><dd>{v.size.length} × {v.size.width} × {v.size.height} m</dd></div>
          <div><dt>Speed</dt><dd>{v.speed}</dd></div>
          <div><dt>Type</dt><dd>{v.kind === "built" ? "Built in code" : "3D model file"}</dd></div>
          <div><dt>Source</dt><dd>{v.credit}</dd></div>
          <div><dt>Id</dt><dd><code>{v.id}</code></dd></div>
        </dl>
      </div>
    </article>
  );
}

export default function Garage() {
  const root = useRef<HTMLDivElement>(null!);
  const [filter, setFilter] = useState<"all" | "traffic" | "new">("all");
  // ?only=id,id shows just those vehicles; ?still starts with the turntables stopped (for comparing or screenshots)
  const [view, setView] = useState<{ only: string[] | null; still: boolean }>({ only: null, still: false });
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setView({ only: q.get("only")?.split(",") ?? null, still: q.has("still") });
  }, []);
  const list = VEHICLE_REGISTRY.filter((v) => (!view.only || view.only.includes(v.id)) && (filter === "all" || (filter === "traffic" ? v.inTraffic : !v.inTraffic)));
  return (
    <div ref={root} className={styles.page}>
      <header className={styles.header}>
        <a href="/" className={styles.back}>← Explore Wayanad</a>
        <h1>Vehicles</h1>
        <p>Every vehicle on the road. Drag a vehicle to turn it, scroll to zoom. <strong>In traffic</strong> ones drive the churam now; <strong>new</strong> ones are Kerala vehicles built for the site and can replace them.</p>
        <div className={styles.filters} role="group" aria-label="Show">
          {(["all", "traffic", "new"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? `All (${VEHICLE_REGISTRY.length})` : f === "traffic" ? `In traffic (${VEHICLE_REGISTRY.filter((v) => v.inTraffic).length})` : `New (${VEHICLE_REGISTRY.filter((v) => !v.inTraffic).length})`}
            </button>
          ))}
        </div>
      </header>
      <main className={styles.grid}>{list.map((v) => <Card key={`${v.id}-${view.still}`} v={v} still={view.still} />)}</main>
      <Canvas eventSource={root} className={styles.canvas} shadows dpr={[1, 2]}>
        <View.Port />
      </Canvas>
    </div>
  );
}
