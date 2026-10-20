"use client";
import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, View } from "@react-three/drei";
import { Box3, CircleGeometry, Group, PMREMGenerator, Texture, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { VEHICLE_REGISTRY, type VehicleEntry } from "@/data/vehicles";
import { BUILDERS } from "@/lib/keralaVehicles";
import styles from "./Garage.module.scss";

/** The vehicle as a Group in metres: a GLB scaled to its registry size, or a built one as built. */
const glbs = new Map<string, Promise<Group>>();
function useVehicle(v: VehicleEntry) {
  const loaded = v.kind === "model" ? use((glbs.get(v.source) ?? glbs.set(v.source, new GLTFLoader().loadAsync(v.source).then((g) => g.scene)).get(v.source)!)) : null;
  return useMemo(() => {
    const g = loaded ? loaded.clone(true) : BUILDERS[v.source]();
    if (loaded) {
      // same normalisation as the traffic: stretch the model's box to the vehicle's size
      const b = new Box3().setFromObject(g), s = b.getSize(new Vector3()), c = b.getCenter(new Vector3());
      const k = new Vector3(v.size.width / s.x, v.size.height / s.y, v.size.length / s.z);
      g.scale.copy(k); g.position.set(-c.x * k.x, -b.min.y * k.y, -c.z * k.z);
      const wrap = new Group(); wrap.add(g); return wrap;
    }
    return g;
  }, [loaded, v]);
}

function Turntable({ v, spin }: { v: VehicleEntry; spin: boolean }) {
  const vehicle = useVehicle(v), turn = useRef<Group>(null);
  useFrame((_, dt) => { if (spin && turn.current) turn.current.rotation.y += dt * 0.35; });
  const reach = Math.max(v.size.length, v.size.height * 2);
  const floor = useMemo(() => new CircleGeometry(reach * 0.75, 48), [reach]);
  return (
    <>
      <group ref={turn}><primitive object={vehicle} /></group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow geometry={floor}>
        <meshStandardMaterial color={0x2a332e} roughness={0.9} />
      </mesh>
      <directionalLight position={[reach, reach * 1.6, reach]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <hemisphereLight args={[0xdfe8ee, 0x26302a, 0.6]} />
      <OrbitControls makeDefault enablePan={false} minDistance={reach * 0.6} maxDistance={reach * 3} target={[0, v.size.height * 0.45, 0]} />
    </>
  );
}

/** Image-based lighting from three's RoomEnvironment (no download): rendered once, set on each view's own scene. */
let studio: Texture | null = null;
function Studio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    studio ??= new PMREMGenerator(gl).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = studio; scene.environmentIntensity = 0.7;
  }, [gl, scene]);
  return null;
}

function Card({ v }: { v: VehicleEntry }) {
  const [spin, setSpin] = useState(true);
  const reach = Math.max(v.size.length, v.size.height * 2);
  return (
    <article className={styles.card}>
      {/* the view is drawn into this box; grabbing it stops the turntable so you can look around */}
      <div className={styles.viewBox} onPointerDown={() => setSpin(false)}>
      <View className={styles.view}>
        <color attach="background" args={["#16241f"]} />
        <PerspectiveCamera makeDefault fov={35} position={[reach * 0.9, reach * 0.45, reach * 1.05]} />
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
  const list = VEHICLE_REGISTRY.filter((v) => filter === "all" || (filter === "traffic" ? v.inTraffic : !v.inTraffic));
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
      <main className={styles.grid}>{list.map((v) => <Card key={v.id} v={v} />)}</main>
      <Canvas eventSource={root} className={styles.canvas} shadows dpr={[1, 2]}>
        <View.Port />
      </Canvas>
    </div>
  );
}
