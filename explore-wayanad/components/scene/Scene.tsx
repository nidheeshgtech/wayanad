"use client";
import { Suspense, use, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { CatmullRomCurve3, DirectionalLight, Points } from "three";
import { archT, bendTs, buildRoadCurve, churamEndT, placesT, setHeightmaps, terrainGrids } from "@/lib/terrain";
import { loadHeightmap, loadRoad } from "@/lib/heightmap";
import { scrollState } from "@/lib/scrollState";
import { DRIVER_LINE, ROUTE, setPace } from "@/lib/drive";
import { setEstateFrame } from "@/lib/estates";
import { patchAtmosphere } from "@/lib/atmosphere";
import Terrain from "./Terrain";
import RoadBand from "./RoadBand";
import Lighting from "./Lighting";
import Road from "./Road";
import Vegetation from "./Vegetation";
import Props from "./Props";
import Gateway from "./Gateway";
import Town, { townCircles } from "./Town";
import TeaHedges from "./TeaHedges";
import RetainingWalls from "./RetainingWalls";
import Creepers from "./Creepers";
import Rain from "./Rain";
import ValleyClouds from "./ValleyClouds";
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
    loadHeightmap("/terrain/plateau").catch((err) => void console.warn("Plateau terrain unavailable:", err)),
    loadRoad().catch((err) => void console.warn("Road unavailable, using the procedural road:", err)),
  ])
    .then(([hm, plateau, road]) => {
      setHeightmaps(plateau ? [hm, plateau] : [hm], road ?? null);
      scrollState.bends = bendTs();
      scrollState.arch = archT();
      scrollState.churamEnd = churamEndT();
      scrollState.places = placesT();
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
      onCreated={({ gl }) => { gl.toneMappingExposure = 1.0; }}
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
  useMemo(() => {
    const screens = setPace(turnProfile(curve), curve.getLength(), scrollState.arch, churamEndT());
    if (process.env.NODE_ENV !== "production") console.info("[drive] screens per act", screens);
    // tea estates: north of the gateway, outside the towns (before anything that places plants or reads the estates)
    setEstateFrame(curve.getPointAt(archT()).z, townCircles(curve));
    scrollState.roadMetres = curve.getLength() * 10;
  }, [curve]);
  const sunRef = useRef<DirectionalLight | null>(null);
  const mistRef = useRef<Points | null>(null);
  const fliesRef = useRef<Points | null>(null);
  // each heightmap tile at full resolution on every tier: at half, the road cut smears and the camera ends up in the bank
  const grids = terrainGrids();
  // road surface segments: ~1.7 m apart (3.3 m on lite), fine enough that the painted lines stay smooth round hairpins
  const detail = Math.round(curve.getLength() * (small ? 3 : 6));
  return (
    <>
      <Lighting sunRef={sunRef} shadows={!small} />
      <Sky />
      {grids.length ? grids.map((g) => <Terrain key={g.index} tile={g.index} segments={g.size - 1} />) : <Terrain segments={small ? 96 : 160} />}
      <RoadBand curve={curve} spacing={small ? 0.45 : 0.3} />
      <Road curve={curve} detail={detail} />
      <RetainingWalls curve={curve} />
      <Creepers curve={curve} density={small ? 0.5 : 1} />
      <Vegetation curve={curve} density={small ? 0.45 : 1} alphaToCoverage={!small} />
      <Suspense fallback={null}><Props curve={curve} density={small ? 0.4 : 1} /></Suspense>
      <Gateway curve={curve} />
      <Town curve={curve} />
      <TeaHedges curve={curve} density={small ? 0.5 : 1} />
      <BendSigns curve={curve} />
      <Shafts curve={curve} count={small ? 20 : 40} />
      <Particles mistRef={mistRef} fliesRef={fliesRef} small={small} />
      <ValleyClouds count={small ? 80 : 160} />
      <Rain count={small ? 1200 : 2500} />
      <Director curve={curve} sunRef={sunRef} mistRef={mistRef} fliesRef={fliesRef} />
      <Quality start={small ? 2 : 0} />
    </>
  );
}

/** Degrees the road's heading turns over each of `steps` from t = 0 to ROUTE.end, from tangents averaged over ±8 units
 * (a driver's line, not every wobble in the mapped centre line). Feeds the climb's pace in lib/drive.ts. */
function turnProfile(curve: CatmullRomCurve3, steps = 4000) {
  const L = curve.getLength(), yaw = (t: number) => {
    let x = 0, z = 0;
    for (let k = -4; k <= 4; k++) { const g = curve.getTangentAt(Math.min(0.999, Math.max(0, t + (k / 4) * (DRIVER_LINE / L)))); x += g.x; z += g.z; }
    return Math.atan2(x, z);
  };
  const out = new Float32Array(steps);
  let prev = yaw(0);
  for (let i = 0; i < steps; i++) {
    const y = yaw(((i + 1) / steps) * ROUTE.end);
    out[i] = (Math.abs(Math.atan2(Math.sin(y - prev), Math.cos(y - prev))) * 180) / Math.PI;
    prev = y;
  }
  return out;
}
