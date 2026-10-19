"use client";
import { Suspense, use, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { CatmullRomCurve3, DirectionalLight, Points } from "three";
import { archT, bendTs, buildRoadCurve, setHeightmap, terrainGrid } from "@/lib/terrain";
import { loadHeightmap, loadRoad } from "@/lib/heightmap";
import { scrollState } from "@/lib/scrollState";
import { DRIVER_LINE, END, setPace } from "@/lib/drive";
import { patchAtmosphere } from "@/lib/atmosphere";
import Terrain from "./Terrain";
import RoadBand from "./RoadBand";
import Lighting from "./Lighting";
import Road from "./Road";
import Vegetation from "./Vegetation";
import Props from "./Props";
import Gateway from "./Gateway";
import Particles from "./Particles";
import Sky from "./Sky";
import Shafts from "./Shafts";
import BendSigns from "./BendSigns";
import Director from "./Director";
import Quality from "./Quality";
import type { Tier } from "@/hooks/useCapability";

patchAtmosphere(); // before any material compiles

/* Fetched once, on first import of the scene chunk. Without the heightmap everything stays procedural;
 * without the road the real terrain gets the procedural road. */
let terrainReady: Promise<void> | null = null;
const loadTerrain = () =>
  (terrainReady ??= Promise.all([
    loadHeightmap(),
    loadRoad().catch((err) => void console.warn("Road unavailable, using the procedural road:", err)),
  ])
    .then(([hm, road]) => {
      setHeightmap(hm, road ?? null);
      scrollState.bends = bendTs();
      scrollState.arch = archT();
    })
    .catch((err) => console.warn("Heightmap unavailable, using procedural terrain:", err)));

export default function Scene({ tier }: { tier: Tier }) {
  const small = tier === "lite";
  return (
    <Canvas
      dpr={[1, small ? 1.5 : 2]}
      camera={{ fov: 60, near: 0.02, far: 400 }}
      gl={{ antialias: !small, powerPreference: "high-performance" }}
      shadows={small ? false : "soft"}
      onCreated={({ gl }) => { gl.toneMappingExposure = 1.12; }}
      style={{ position: "fixed", inset: 0, zIndex: 0 }}
    >
      <Suspense fallback={null}>
        <World small={small} />
      </Suspense>
    </Canvas>
  );
}

/** Everything that samples the ground. Renders once the heightmap has loaded (or failed). */
function World({ small }: { small: boolean }) {
  use(loadTerrain());
  const curve = useMemo(() => buildRoadCurve(), []);
  useMemo(() => setPace(turnProfile(curve), curve.getLength(), scrollState.arch), [curve]);
  const sunRef = useRef<DirectionalLight | null>(null);
  const mistRef = useRef<Points | null>(null);
  const fliesRef = useRef<Points | null>(null);
  const grid = terrainGrid();
  // the heightmap at full resolution on every tier: at half, the road cut smears and the camera ends up inside the bank
  const segments = grid ? grid.size - 1 : small ? 96 : 160;
  // road surface segments: ~1.7 m apart (3.3 m on lite), fine enough that the painted lines stay smooth round hairpins
  const detail = Math.round(curve.getLength() * (small ? 3 : 6));
  return (
    <>
      <Lighting sunRef={sunRef} shadows={!small} />
      <Sky />
      <Terrain segments={segments} />
      <RoadBand curve={curve} spacing={small ? 0.45 : 0.3} />
      <Road curve={curve} detail={detail} />
      <Vegetation curve={curve} density={small ? 0.45 : 1} alphaToCoverage={!small} />
      <Suspense fallback={null}><Props curve={curve} density={small ? 0.4 : 1} /></Suspense>
      <Gateway curve={curve} />
      <BendSigns curve={curve} />
      <Shafts curve={curve} count={small ? 20 : 40} />
      <Particles mistRef={mistRef} fliesRef={fliesRef} small={small} />
      <Director curve={curve} sunRef={sunRef} mistRef={mistRef} fliesRef={fliesRef} />
      <Quality start={small ? 2 : 0} />
    </>
  );
}

/** Degrees the road's heading turns over each of 2,000 steps from t = 0 to END, from tangents averaged over ±8 units
 * (a driver's line, not every wobble in the mapped centre line). Feeds the climb's pace in lib/drive.ts. */
function turnProfile(curve: CatmullRomCurve3, steps = 2000) {
  const L = curve.getLength(), yaw = (t: number) => {
    let x = 0, z = 0;
    for (let k = -4; k <= 4; k++) { const g = curve.getTangentAt(Math.min(0.999, Math.max(0, t + (k / 4) * (DRIVER_LINE / L)))); x += g.x; z += g.z; }
    return Math.atan2(x, z);
  };
  const out = new Float32Array(steps);
  let prev = yaw(0);
  for (let i = 0; i < steps; i++) {
    const y = yaw(((i + 1) / steps) * END);
    out[i] = (Math.abs(Math.atan2(Math.sin(y - prev), Math.cos(y - prev))) * 180) / Math.PI;
    prev = y;
  }
  return out;
}
