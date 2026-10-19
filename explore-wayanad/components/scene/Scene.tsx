"use client";
import { Suspense, use, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { DirectionalLight, Points } from "three";
import { bendTs, buildRoadCurve, setHeightmap, terrainGrid } from "@/lib/terrain";
import { loadHeightmap, loadRoad } from "@/lib/heightmap";
import { scrollState } from "@/lib/scrollState";
import Terrain from "./Terrain";
import Road from "./Road";
import Forest from "./Forest";
import Gateway from "./Gateway";
import Particles from "./Particles";
import Director from "./Director";
import type { Tier } from "@/hooks/useCapability";

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
    })
    .catch((err) => console.warn("Heightmap unavailable, using procedural terrain:", err)));

export default function Scene({ tier }: { tier: Tier }) {
  const small = tier === "lite";
  return (
    <Canvas
      dpr={[1, small ? 1.5 : 2]}
      camera={{ fov: 58, near: 0.1, far: 400 }}
      gl={{ antialias: !small, powerPreference: "high-performance" }}
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
  const sunRef = useRef<DirectionalLight | null>(null);
  const mistRef = useRef<Points | null>(null);
  const fliesRef = useRef<Points | null>(null);
  const grid = terrainGrid();
  const segments = grid ? (small ? (grid.size - 1) >> 1 : grid.size - 1) : small ? 96 : 160;
  // the prototype's 900 tube segments over its ~600-unit road, kept per unit for the 1,300-unit real one
  const detail = Math.max(small ? 500 : 900, Math.round(curve.getLength() * (small ? 1 : 1.5)));
  const trees = Math.round((small ? 700 : 1800) * Math.max(1, curve.getLength() / 600));
  return (
    <>
      <hemisphereLight args={[0xdfe8e4, 0x1a2a24, 0.9]} />
      <directionalLight ref={sunRef} position={[40, 60, -20]} intensity={1} />
      <Terrain segments={segments} />
      <Road curve={curve} detail={detail} />
      <Forest curve={curve} count={trees} />
      <Gateway curve={curve} />
      <Particles mistRef={mistRef} fliesRef={fliesRef} small={small} />
      <Director curve={curve} sunRef={sunRef} mistRef={mistRef} fliesRef={fliesRef} />
    </>
  );
}
