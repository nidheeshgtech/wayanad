"use client";
import { Suspense, use, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { CatmullRomCurve3, DirectionalLight, Points } from "three";
import { archT, bendTs, buildRoadCurve, churamEndT, forestRoad, placesT, setHeightmaps, terrainGrids } from "@/lib/terrain";
import { loadHeightmap, loadRoad } from "@/lib/heightmap";
import { scrollState } from "@/lib/scrollState";
import { DRIVER_LINE, ROUTE, setForestPace, setPace } from "@/lib/drive";
import { estateUniforms, setEstateFrame } from "@/lib/estates";
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
import Waterfalls from "./Waterfalls";
import Monkeys from "./Monkeys";
import Rain from "./Rain";
import Traffic from "./Traffic";
import WeatherDebug from "./WeatherDebug";
import ValleyClouds from "./ValleyClouds";
import Particles from "./Particles";
import Sky from "./Sky";
import Shafts from "./Shafts";
import BendSigns from "./BendSigns";
import Director from "./Director";
import Quality from "./Quality";
import PerfProbe from "./PerfProbe";
import Warmup from "./Warmup";
import ShowIn, { FOREST_ACTS } from "./ShowIn";
import Elephant from "./Elephant";
import Checkpost from "./Checkpost";
import type { Tier } from "@/hooks/useCapability";
import PlayerCar from "../drive/PlayerCar";

patchAtmosphere(); // before any material compiles

/* Fetched once, on first import of the scene chunk. Without the heightmap everything stays procedural;
 * without the road the real terrain gets the procedural road. */
let terrainReady: Promise<void> | null = null;
const loadTerrain = () =>
  (terrainReady ??= Promise.all([
    loadHeightmap(),
    loadHeightmap("/terrain/plateau").catch((err) => void console.warn("Plateau terrain unavailable:", err)),
    loadRoad().catch((err) => void console.warn("Road unavailable, using the procedural road:", err)),
    loadHeightmap("/terrain/forest").catch((err) => void console.warn("Forest terrain unavailable:", err)),
    loadRoad("/terrain/forest-road.json").catch((err) => void console.warn("Forest road unavailable:", err)),
  ])
    .then(([hm, plateau, road, forestHm, forestRd]) => {
      const tiles = [{ ...hm, region: "churam" }, ...(plateau ? [{ ...plateau, region: "plateau" }] : []), ...(forestHm && forestRd ? [{ ...forestHm, region: "forest" }] : [])];
      setHeightmaps(tiles, road ?? null, forestHm && forestRd ? forestRd : null);
      scrollState.bends = bendTs();
      scrollState.arch = archT();
      scrollState.churamEnd = churamEndT();
      scrollState.places = placesT();
    })
    .catch((err) => console.warn("Heightmap unavailable, using procedural terrain:", err)));

/** `mode`: "story" (the scroll-driven page) or "drive" (/drive: you drive the bus; components/drive). */
export default function Scene({ tier, mode = "story" }: { tier: Tier; mode?: "story" | "drive" }) {
  const small = tier === "lite";
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 60, near: 0.02, far: 400 }}
      gl={{ antialias: true, powerPreference: "high-performance" }} // MSAA is cheap on phone (tile) GPUs and removes the jagged edges
      shadows={small ? false : "soft"}
      onCreated={({ gl }) => { gl.toneMappingExposure = 1.0; }}
      style={{ position: "fixed", inset: 0, zIndex: 0 }}
    >
      <Suspense fallback={null}>
        <World small={small} mode={mode} />
      </Suspense>
    </Canvas>
  );
}

/** Everything that samples the ground. Renders once the heightmap has loaded (or failed). */
function World({ small, mode }: { small: boolean; mode: "story" | "drive" }) {
  use(loadTerrain());
  const curve = useMemo(() => buildRoadCurve(), []);
  useMemo(() => {
    const screens = setPace(turnProfile(curve), curve.getLength(), scrollState.arch, churamEndT());
    if (process.env.NODE_ENV !== "production") console.info("[drive] screens per act", screens);
    // tea estates: north of the gateway, outside the towns (before anything that places plants or reads the estates)
    setEstateFrame(curve.getPointAt(archT()).z, townCircles(curve));
    scrollState.roadMetres = curve.getLength() * 10;
  }, [curve]);
  const forest = useMemo(() => {
    const f = forestRoad();
    if (f) {
      estateUniforms.uForestX.value = Math.min(f.curve.getPointAt(0).x, f.curve.getPointAt(1).x) - 40;
      const screens = setForestPace(turnProfile(f.curve, 2000, 1), f.curve.getLength(), f.muthanga);
      if (process.env.NODE_ENV !== "production") console.info("[drive] forest screens", screens);
    }
    return f;
  }, []);
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
      <ShowIn acts={FOREST_ACTS} not>
      {grids.length ? grids.filter((g) => g.region !== "forest").map((g) => <Terrain key={g.index} tile={g.index} segments={g.size - 1} />) : <Terrain segments={small ? 96 : 160} />}
      <RoadBand curve={curve} spacing={small ? 0.6 : 0.4} />
      <Road curve={curve} detail={detail} />
      <Suspense fallback={null}><Traffic curve={curve} small={small} /></Suspense>
      <RetainingWalls curve={curve} />
      <Creepers curve={curve} density={small ? 0.5 : 1} />
      <Waterfalls curve={curve} />
      <Suspense fallback={null}><Monkeys curve={curve} /></Suspense>
      <Vegetation curve={curve} density={small ? 0.45 : 1} alphaToCoverage={!small} />
      <Suspense fallback={null}><Props curve={curve} density={small ? 0.4 : 1} /></Suspense>
      <Gateway curve={curve} />
      <Town curve={curve} />
      <TeaHedges curve={curve} density={small ? 0.5 : 1} />
      <BendSigns curve={curve} />
      <Shafts curve={curve} count={small ? 20 : 40} />
      </ShowIn>
      {forest && (
        <ShowIn acts={FOREST_ACTS} defer>
          {grids.filter((g) => g.region === "forest").map((g) => <Terrain key={g.index} tile={g.index} segments={g.size - 1} />)}
          <RoadBand curve={forest.curve} spacing={small ? 0.6 : 0.4} />
          <Road curve={forest.curve} detail={Math.round(forest.curve.getLength() * (small ? 2 : 4))} kind="forest" />
          <Vegetation curve={forest.curve} density={small ? 0.45 : 1} alphaToCoverage={!small} kind="forest" />
          <Suspense fallback={null}><Props curve={forest.curve} density={small ? 0.4 : 1} towns={false} /></Suspense>
          <Shafts curve={forest.curve} count={small ? 40 : 90} />
          <Elephant curve={forest.curve} />
          <Checkpost curve={forest.curve} />
        </ShowIn>
      )}
      <Particles mistRef={mistRef} fliesRef={fliesRef} small={small} />
      <ValleyClouds count={small ? 80 : 160} />
      <Rain count={small ? 2000 : 4500} />
      {mode === "drive" && <Suspense fallback={null}><PlayerCar curve={curve} forest={forest?.curve ?? null} /></Suspense>}
      <Director curve={curve} forest={forest?.curve ?? null} sunRef={sunRef} mistRef={mistRef} fliesRef={fliesRef} />
      <Quality start={small ? 2 : 0} lite={small} />
      <PerfProbe />
      <Warmup needs={mode === "drive" ? ["mountain-traffic", "player-car"] : ["mountain-traffic"]} />
      {process.env.NODE_ENV !== "production" && <WeatherDebug />}
    </>
  );
}

/** Degrees the road's heading turns over each of `steps` from t = 0 to ROUTE.end, from tangents averaged over ±8 units
 * (a driver's line, not every wobble in the mapped centre line). Feeds the climb's pace in lib/drive.ts. */
function turnProfile(curve: CatmullRomCurve3, steps = 4000, span = ROUTE.end) {
  const L = curve.getLength(), yaw = (t: number) => {
    let x = 0, z = 0;
    for (let k = -4; k <= 4; k++) { const g = curve.getTangentAt(Math.min(0.999, Math.max(0, t + (k / 4) * (DRIVER_LINE / L)))); x += g.x; z += g.z; }
    return Math.atan2(x, z);
  };
  const out = new Float32Array(steps);
  let prev = yaw(0);
  for (let i = 0; i < steps; i++) {
    const y = yaw(((i + 1) / steps) * span);
    out[i] = (Math.abs(Math.atan2(Math.sin(y - prev), Math.cos(y - prev))) * 180) / Math.PI;
    prev = y;
  }
  return out;
}
