"use client";
import { Suspense, use, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { AdditiveBlending, Box3, Quaternion, Raycaster, Vector2, CanvasTexture, Color, Group, Mesh, MeshStandardMaterial, NormalBlending, Sprite, SpriteMaterial, Vector3, type Object3D } from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import { loadVehicle } from "@/lib/vehicleAssets";
import { autoWheels, type Wheel } from "@/lib/autoWheels";
import { debadge } from "@/lib/debadge";
import { autoRotors, type Rotor } from "@/lib/autoRotors";
import type { NewRide } from "@/data/newGarage";

export type View = "outside" | "inside" | "wheel" | "side" | "rearside" | "front" | "back" | "left" | "right" | "top";
type Ready = { model: Object3D; wheels: Wheel[]; rotors: Rotor[]; size: Vector3 };

/** A new ride made ready to show: turned so its length runs along z (front to +z), at its real length in metres,
 * standing on the floor in the middle, its wheels found so they roll (lib/autoWheels). Cached per ride. */
const cache = new Map<string, Promise<Ready>>();
export function readyRide(r: NewRide) {
  if (!cache.has(r.id)) cache.set(r.id, loadVehicle(r.file).then((src) => {
    const inner = src.clone(true), model = new Group();
    model.add(inner);
    // ground and shadow planes some files carry: flat, a few triangles, as big as the car (they'd set its size)
    const all = new Box3().setFromObject(inner).getSize(new Vector3()), flat: Mesh[] = [];
    inner.traverse((o) => {
      const m = o as Mesh; if (!m.isMesh) return;
      const n = (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute("position").count) / 3, s = new Box3().setFromObject(m).getSize(new Vector3());
      if ((n <= 24 || s.y < 0.005 * Math.max(all.x, all.z)) && s.y < 0.02 * all.y && s.x * s.z > 0.4 * all.x * all.z) flat.push(m);
    });
    for (const m of flat) m.removeFromParent();
    // a file with several vehicles side by side: only the part of it along its length `crop` gives (fractions)
    if (r.crop) {
      const b = new Box3().setFromObject(inner), x = all.x >= all.z ? "x" : "z", lo = b.min[x], span = b.max[x] - lo, out: Mesh[] = [];
      inner.traverse((o) => { const m = o as Mesh; if (!m.isMesh) return; const c = new Box3().setFromObject(m).getCenter(new Vector3())[x];
        if (c < lo + r.crop![0] * span || c > lo + r.crop![1] * span) out.push(m); });
      for (const m of out) m.removeFromParent();
    }
    let size = new Box3().setFromObject(inner).getSize(new Vector3());
    if (size.x > size.z) inner.rotation.y = Math.PI / 2;
    inner.rotation.y += (r.turn ? Math.PI : 0) + (r.yaw ?? 0);
    if (r.pitch) inner.rotation.x = r.pitch;
    inner.updateMatrixWorld(true);
    size = new Box3().setFromObject(inner).getSize(new Vector3());
    inner.scale.multiplyScalar(r.length / size.z);
    inner.updateMatrixWorld(true);
    const b = new Box3().setFromObject(inner), c = b.getCenter(new Vector3());
    inner.position.set(-c.x, -b.min.y, -c.z);
    model.traverse((o) => {
      const m = o as Mesh; if (!m.isMesh) return; m.castShadow = true;
      for (const mat of [m.material].flat() as MeshStandardMaterial[]) if (mat.isMeshStandardMaterial) mat.envMapIntensity = 1;
    });
    if (r.clean) debadge(model, r.clean);
    // (a helicopter has rotors, not wheels: its skids or little wheels stay put)
    const rotors = r.cls === "heli" ? autoRotors(model, { tail: r.tail, main: r.main, hub: r.hub }) : [];
    const wheels = r.cls === "heli" ? [] : autoWheels(model, { maxRadius: r.cls === "bike" ? 0.2 : r.cls === "offroad" || r.cls === "truck" ? 0.16 : 0.1 });
    // stand it on its tyres (a stray part hanging lower, as a bike's chain can, set the floor otherwise)
    if (wheels.length) { const low = Math.min(...wheels.map((w) => w.pivot.position.y - w.radius)); if (low > 0.005) model.position.y -= low; }
    return { model, wheels, rotors, size: new Box3().setFromObject(model).getSize(new Vector3()) };
  }));
  return cache.get(r.id)!;
}

/** Soft round puffs (one texture for all). */
let puffTex: CanvasTexture | null = null;
function puff() {
  if (puffTex) return puffTex;
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const g = cv.getContext("2d")!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(0.45, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (puffTex = new CanvasTexture(cv));
}

const POOL = 48, X_AXIS = new Vector3(1, 0, 0);
function Ride({ ride, view, rev, qc, still, spinTo, onInfo }: { ride: NewRide; view: View; rev: number; qc?: boolean; still?: boolean; spinTo?: number; onInfo?: (w: Wheel[]) => void }) {
  const { model, wheels, rotors, size } = use(readyRide(ride));
  const bike = ride.cls === "bike", heli = ride.cls === "heli";
  const scene = useThree((s) => s.scene), camera = useThree((s) => s.camera), controls = useThree((s) => s.controls) as unknown as OrbitImpl | null;
  // smoke: a pool of puffs out of the tailpipe, in the ride's own colour
  const smoke = useMemo(() => {
    const g = new Group(), colour = new Color(ride.smoke);
    const bright = colour.getHSL({ h: 0, s: 0, l: 0 }).l > 0.6 || colour.getHSL({ h: 0, s: 0, l: 0 }).s < 0.2;
    for (let i = 0; i < POOL; i++) {
      const s = new Sprite(new SpriteMaterial({ map: puff(), color: colour, transparent: true, depthWrite: false, opacity: 0, blending: bright ? NormalBlending : AdditiveBlending }));
      s.userData = { life: 1, v: new Vector3() }; s.visible = false; g.add(s);
    }
    return g;
  }, [ride.smoke]);
  const pipe = useMemo(() => new Vector3(bike ? -0.12 : -size.x * 0.28, bike ? 0.42 : 0.28, -size.z / 2 - 0.05), [bike, size]);
  const t = useRef({ owed: 0, revAt: -10, next: 0 });
  useEffect(() => {
    if (!rev) return;
    t.current.revAt = performance.now() / 1000;
    // from outside, swing round behind to see the smoke
    if (view === "outside" && controls) {
      const L = size.z; camera.position.set(-L * 0.75, Math.max(1.0, size.y * 0.8), -L * 1.0); controls.update();
    }
  }, [rev]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onInfo?.(wheels), [wheels, onInfo]);
  // the studio's haze at the vehicle's scale (a 12 m helicopter seen whole would sit in the fog otherwise)
  useEffect(() => { const f = scene.fog as { near: number; far: number } | null; if (f) { f.near = Math.max(12, size.z * 1.8); f.far = Math.max(26, size.z * 4); } }, [scene, size]);
  // QC: the wheels found, tinted, so a missed or wrong one shows
  useEffect(() => {
    if (!qc) return;
    (window as unknown as { __ride?: Object3D }).__ride = model;
    // __pick(x, y): what part is under that pixel of the canvas (name, material, the texture spot) — for finding badges
    (window as unknown as { __pick?: (x: number, y: number) => unknown }).__pick = (x: number, y: number) => {
      const el = document.querySelector("[class*=stage] canvas") as HTMLCanvasElement, r = el.getBoundingClientRect();
      const ray = new Raycaster(); ray.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      return ray.intersectObject(model, true).filter((h) => (h.object as Mesh).visible).slice(0, 3).map((h) => {
        const m = (h.object as Mesh).material as MeshStandardMaterial;
        const at = model.worldToLocal(h.point.clone()).toArray().map((v) => +v.toFixed(3));
        return { at, mesh: h.object.name, material: m.name, uv: h.uv?.toArray().map((v) => +v.toFixed(3)), map: m.map ? [m.map.image?.width, m.map.image?.height] : null, d: +h.distance.toFixed(2) };
      });
    };
    for (const w of [...wheels, ...rotors]) w.pivot.traverse((o) => { const m = o as Mesh; if (m.isMesh && !location.search.includes("notint")) { const was = m.material as MeshStandardMaterial; m.material = new MeshStandardMaterial({ color: 0xff2fb0, roughness: 0.6, transparent: was.transparent, opacity: was.opacity }); } });
  }, [qc, wheels, rotors]);

  // the camera for each view
  useEffect(() => {
    const L = size.z, H = size.y, W = size.x;
    // (a driver's eye: about a metre up in a low car, higher in a 4×4; on a bike, the rider's, behind the bars)
    const eye = { super: 0.98, muscle: 1.02, offroad: 1.2, truck: 1.5, bike: 1.42, heli: 1.6 }[ride.cls];
    // (a helicopter's cockpit: just behind its nose — the body without its rotors, which overhang it)
    let nose = 0, floor = 0;
    if (heli) { const b = new Box3(); model.updateMatrixWorld(true); model.traverse((o) => { const m = o as Mesh; if (!m.isMesh || !m.visible) return; for (let q: Object3D | null = m; q; q = q.parent) if (q.name === "rotor") return; b.expandByObject(m); }); nose = b.max.z; floor = b.min.y; }
    const seat = ride.seat ? new Vector3(...ride.seat) : heli ? new Vector3(0.38, floor + 1.75, nose - (ride.cockpit ?? 1.9)) : bike ? new Vector3(0, eye, -L * 0.2) : new Vector3(Math.min(0.37, W * 0.2), Math.min(eye, H * 0.82), -L * 0.07);
    // (QC: straight at the right side of the front wheel, to see what turns with it)
    const fw = wheels.filter((w) => w.front === (view === "side")).sort((a, b) => b.pivot.position.x - a.pivot.position.x)[0] ?? wheels[0];
    if ((view === "side" || view === "rearside") && fw) {
      const c = fw.pivot.position.clone().add(model.position);
      camera.position.set(c.x + fw.radius * 7, c.y, c.z); (camera as unknown as { fov: number }).fov = 24; camera.updateProjectionMatrix();
      if (controls) { controls.target.copy(c); controls.autoRotate = false; controls.update(); } else camera.lookAt(c);
      return;
    }
    // (QC: square-on views, for finding badges and lettering)
    const sq: Partial<Record<View, Vector3>> = { front: new Vector3(0, H * 0.5, L * 2.2), back: new Vector3(0, H * 0.5, -L * 2.2), left: new Vector3(L * 2.2, H * 0.5, 0), right: new Vector3(-L * 2.2, H * 0.5, 0), top: new Vector3(0, L * 2.4, 0.01) };
    if (sq[view]) {
      camera.position.copy(sq[view]!); (camera as unknown as { fov: number }).fov = view === "front" || view === "back" ? 13 : 17; camera.updateProjectionMatrix();
      if (controls) { controls.target.set(0, view === "top" ? 0 : H * 0.5, 0); controls.autoRotate = false; controls.update(); }
      return;
    }
    if (heli && view === "wheel") {
      // (the rotor: from up high at the side, looking at the hub)
      camera.position.set(L * 0.55, H * 1.9, L * 0.45); (camera as unknown as { fov: number }).fov = 34; camera.updateProjectionMatrix();
      if (controls) { controls.target.set(0, H * 0.85, 0); controls.autoRotate = true; controls.enableZoom = true; controls.minDistance = L * 0.3; controls.maxDistance = L * 2.4; controls.update(); }
      return;
    }
    const at = view === "inside" ? seat : view === "wheel" ? new Vector3(W * 0.5 + L * 0.32, 0.45, L * 0.38) : new Vector3(L * 0.85, Math.max(1.1, H * 0.85), L * 0.95);
    const look = view === "inside" ? seat.clone().add(new Vector3(0, bike ? -0.35 : heli ? -0.35 : -0.12, 1.4)) : view === "wheel" ? new Vector3(W * 0.42, 0.33, L * 0.3) : new Vector3(0, H * 0.4, 0);
    camera.position.copy(at); (camera as unknown as { fov: number }).fov = view === "inside" ? 62 : 34; camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(view === "inside" ? at.clone().add(look.clone().sub(at).normalize().multiplyScalar(0.02)) : look);
      controls.autoRotate = view === "outside" && !still; controls.enableZoom = view !== "inside"; controls.minDistance = view === "inside" ? 0 : L * 0.45; controls.maxDistance = L * 2.4;
      controls.update();
    } else camera.lookAt(look);
  }, [view, size, camera, controls, ride.seat, bike, heli, still, wheels, model]);

  useFrame((_, dt) => {
    const now = performance.now() / 1000, since = now - t.current.revAt, revving = since < 1.6;
    const spin = revving ? 16 * Math.sin(Math.min(1, since / 1.6) * Math.PI) + 2 : 2.2;
    // (about each wheel's own axle: the pivot's x)
    if (spinTo !== undefined) for (const w of wheels) w.pivot.quaternion.copy(w.pivot.userData.base as Quaternion).multiply(new Quaternion().setFromAxisAngle(X_AXIS, spinTo));
    else for (const w of wheels) w.pivot.rotateX((spin * dt * 0.33) / Math.max(0.15, w.radius));
    // rotors: idling round, a rev winds them up to a blur (the tail one several times faster)
    const rpm = revving ? 3 + 22 * Math.sin(Math.min(1, since / 1.6) * Math.PI / 2) * (since < 1.2 ? 1 : Math.max(0.15, 1 - (since - 1.2) / 0.4)) : 3;
    for (const r of rotors) if (spinTo !== undefined) r.pivot.rotation.set(r.axis === "x" ? spinTo : 0, r.axis === "y" ? spinTo : 0, 0);
    else if (r.axis === "y") r.pivot.rotation.y += rpm * dt; else r.pivot.rotation.x += rpm * 4.5 * dt;
    // smoke: a thin idle trickle, a burst on a rev
    t.current.owed += dt * (revving ? (heli ? 60 : 38) : heli ? 0 : 3);
    for (const s of smoke.children as Sprite[]) {
      const u = s.userData as { life: number; v: Vector3 };
      if (!s.visible && t.current.owed >= 1) {
        t.current.owed -= 1; s.visible = true; u.life = 0;
        if (heli) {
          // (a helicopter: no exhaust to see — its downwash throws dust out across the floor, in its colour)
          const a = Math.random() * Math.PI * 2, r0 = Math.max(size.x, size.z) * 0.25;
          s.position.set(Math.cos(a) * r0, 0.15, Math.sin(a) * r0); u.v.set(Math.cos(a) * 3.2, 0.25 + Math.random() * 0.3, Math.sin(a) * 3.2);
        } else {
          s.position.copy(pipe);
          u.v.set((Math.random() - 0.5) * 0.25, 0.18 + Math.random() * 0.2, -(revving ? 1.1 : 0.35) - Math.random() * 0.3);
        }
      }
      if (!s.visible) continue;
      u.life += dt / 1.8; if (u.life >= 1) { s.visible = false; continue; }
      s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(1 - dt * 0.9);
      const k = u.life; s.scale.setScalar(heli ? 0.5 + k * 2.6 : 0.18 + k * 1.1);
      (s.material as SpriteMaterial).opacity = (revving ? 0.42 : 0.22) * Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - k);
    }
    t.current.owed = Math.min(t.current.owed, 4);
  });
  // inside, the roof shades the cabin from the studio lights: a soft light in the cabin, as a car's courtesy lamp
  const cabin = ride.seat ? new Vector3(...ride.seat) : new Vector3(0, Math.min(1.1, size.y * 0.7), -size.z * 0.05);
  return (<group>
    <primitive object={model} /><primitive object={smoke} />
    {view === "inside" && <><ambientLight intensity={2.2} /><pointLight position={[0, cabin.y + 0.15, cabin.z + 0.4]} intensity={14} distance={4} decay={1} color={0xfff2e0} /></>}
  </group>);
}

/** The showroom: a dark studio floor, soft overhead strip lights and a warm rim (reflections from light panels, made
 * in the scene: no download), a contact shadow, the ride on the floor. Drag to look round; `view` moves the camera. */
export default function ShowroomView({ ride, view = "outside", rev = 0, qc, still, spinTo, onInfo }: { ride: NewRide; view?: View; rev?: number; qc?: boolean; still?: boolean; spinTo?: number; onInfo?: (w: Wheel[]) => void }) {
  return (
    <Canvas dpr={[1, 2]} shadows camera={{ position: [4, 1.6, 4], fov: 34 }} gl={{ antialias: true, preserveDrawingBuffer: !!qc || !!still }}>
      <color attach="background" args={[0x0c1411]} />
      <fog attach="fog" args={[0x0c1411, 12, 26]} />
      <hemisphereLight args={[0xe8eef2, 0x2a3530, 0.9]} />
      <directionalLight position={[3, 7, 4]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 3, -3]} intensity={0.7} color={0xffe2b0} />
      <spotLight position={[0, 9, 0]} angle={0.5} penumbra={0.8} intensity={60} distance={20} color={0xfff6ea} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 1.4, 1]} />
        <Lightformer form="rect" intensity={2} position={[0, 6, -3]} rotation-x={Math.PI / 2} scale={[10, 1, 1]} />
        <Lightformer form="rect" intensity={2} position={[0, 6, 3]} rotation-x={Math.PI / 2} scale={[10, 1, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-7, 2, 0]} rotation-y={Math.PI / 2} scale={[14, 2, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#ffd27a" position={[7, 1.5, -2]} rotation-y={-Math.PI / 2} scale={[14, 1.4, 1]} />
        <Lightformer form="ring" intensity={1.5} position={[0, 3, 9]} scale={3} />
      </Environment>
      <mesh rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[30, 64]} /><meshStandardMaterial color={0x1c2522} roughness={0.32} metalness={0.25} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.002}><ringGeometry args={[3.6, 3.66, 96]} /><meshBasicMaterial color={0xd9a441} transparent opacity={0.5} /></mesh>
      <ContactShadows position={[0, 0.004, 0]} scale={12} blur={2.2} opacity={0.75} far={3} resolution={512} />
      <OrbitControls makeDefault enablePan={false} autoRotateSpeed={0.9} maxPolarAngle={Math.PI / 2 - 0.04} />
      <Suspense fallback={null}><Ride ride={ride} view={view} rev={rev} qc={qc} still={still} spinTo={spinTo} onInfo={onInfo} /></Suspense>
    </Canvas>
  );
}
