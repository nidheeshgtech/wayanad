"use client";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, FogExp2, MathUtils, Points, Vector3, CatmullRomCurve3, DirectionalLight, Mesh, MeshLambertMaterial } from "three";
import { scrollState } from "@/lib/scrollState";
import { PALETTE } from "@/data/acts";
import { height } from "@/lib/terrain";

/**
 * Reads scrollState every frame and places the camera, fog, light and particles.
 * Act 1 follows the road spline; later acts move between keyed spots on the plateau.
 */
/** [x, height above ground, z] for camera (a) and look target (b), laid out around the prototype's road end at (0, PROTO_END_Z);
 * shifted to wherever the road actually ends and resolved against the terrain once it has loaded. */
const PROTO_END_Z = -204;

/** Storyboard fog for the climb, keyed to the hairpins (t on the road, bend 1 = bends[0]): clear air through 1–3,
 * first mist by 6, nearly white from 7 to 9, then the mist breaks before Lakkidi. */
function churamMood(t: number, bends: number[]) {
  const keys: [number, number, number][] = [ // [t, fog density, mist opacity]
    [0, 0.02, 0.12], [bends[2], 0.022, 0.18], [bends[5], 0.06, 0.35], [bends[6], 0.11, 0.55], [bends[8], 0.11, 0.55], [0.98, 0.012, 0],
  ];
  const i = Math.max(0, keys.findIndex(([k]) => k > t) - 1);
  const [t0, f0, m0] = keys[i], [t1, f1, m1] = keys[Math.min(i + 1, keys.length - 1)];
  const k = t1 > t0 ? MathUtils.smoothstep(t, t0, t1) : 1;
  return { fog: f0 + (f1 - f0) * k, mist: m0 + (m1 - m0) * k };
}
const LOOK_AHEAD = 7.2; // units ahead of the camera's road point: 0.012 of the prototype's ~600-unit road
const SPOTS: Record<string, [number[], number[]]> = {
  kalpetta:   [[-10, 24, -150], [0, 4, -230]],
  soochipara: [[45, 6, -95], [20, 12, -150]],
  kuruva:     [[-60, 8, -150], [-30, 6, -200]],
  edakkal:    [[70, 5, -175], [85, 10, -215]],
  forest:     [[0, 3, -185], [0, 3, -260]],
  border:     [[0, 4, -230], [0, 6, -300]],
  stay:       [[-20, 12, -190], [-40, 6, -240]],
  night:      [[-25, 5, -200], [-45, 8, -250]],
  plan:       [[-25, 5, -200], [-45, 8, -250]],
};

export default function Director({ curve, sunRef, mistRef, fliesRef }: {
  curve: CatmullRomCurve3;
  sunRef: React.MutableRefObject<DirectionalLight | null>;
  mistRef: React.MutableRefObject<Points | null>;
  fliesRef: React.MutableRefObject<Points | null>;
}) {
  const { scene, camera } = useThree();
  const tmp = useRef(new Vector3()), look = useRef(new Vector3()), up = useRef(new Vector3(0, 1, 0));
  const { spots, length, plateau, end } = useMemo(() => {
    const end = curve.getPointAt(1), dir = curve.getTangentAt(1).setY(0).normalize();
    const onGround = ([x, y, z]: number[]) => { const wx = x + end.x, wz = z - PROTO_END_Z + end.z; return [wx, height(wx, wz) + y, wz]; };
    const ahead = end.clone().addScaledVector(dir, 40);
    return {
      spots: Object.fromEntries(Object.entries(SPOTS).map(([k, [a, b]]) => [k, [onGround(a), onGround(b)]])),
      length: curve.getLength(),
      plateau: ahead.setY(height(ahead.x, ahead.z) + 2), // where the camera looks as it lifts off the road at Lakkidi
      end,
    };
  }, [curve]);
  if (!scene.fog) { scene.fog = new FogExp2(PALETTE.churam.fog, 0.02); scene.background = new Color(PALETTE.churam.sky); }

  useFrame(() => {
    const { act, progress: p, hold } = scrollState;
    const P = PALETTE[act];
    const fog = scene.fog as FogExp2;

    /* ---- camera ---- */
    if (act === "churam") {
      const t = Math.min(0.995, Math.max(0, p * 0.98));
      const pt = curve.getPointAt(t), ahead = curve.getPointAt(Math.min(0.999, t + LOOK_AHEAD / length));
      tmp.current.copy(pt).add(up.current.clone().multiplyScalar(1.9)).add(pt.clone().sub(ahead).setY(0).normalize().multiplyScalar(2.5));
      look.current.copy(ahead).add(new Vector3(0, 1.4, 0));
      // through the arch, then lift for the plateau (added to the target, so it eases in instead of compounding each frame)
      if (p > 0.95) { const k = (p - 0.95) / 0.05; tmp.current.y += k * 14; look.current.copy(plateau); }
      camera.position.lerp(tmp.current, 0.12);
    } else {
      const [a, b] = spots[act];
      const e = p * (1 - hold * 0.6);
      tmp.current.set(a[0] + (b[0] - a[0]) * e * 0.5, a[1], a[2] + (b[2] - a[2]) * e * 0.25);
      camera.position.lerp(tmp.current, 0.06);
      look.current.set(b[0], b[1], b[2]);
      // turn to face back the way you came
      if (act === "border" && p > 0.55) {
        const k = (p - 0.55) / 0.45, z = -300 - PROTO_END_Z + end.z + k * 460, back = end.z + 84;
        look.current.set(end.x, height(end.x, back) + 10 - k * 4, z);
      }
    }
    camera.lookAt(look.current);

    /* ---- mood ---- */
    let fogDensity = P.fogDensity, mist = P.mist;
    if (act === "churam") ({ fog: fogDensity, mist } = churamMood(p * 0.98, scrollState.bends));
    // fireflies come out through Stay, peak at Night, and fade over Plan
    const flies = act === "stay" ? P.flies * p : act === "plan" ? 0.9 * (1 - p) : P.flies;
    fog.color.lerp(new Color(P.fog), 0.05);
    (scene.background as Color).lerp(new Color(P.sky), 0.05);
    fog.density += (fogDensity - fog.density) * 0.08;
    const terrain = scene.getObjectByName("terrain") as Mesh | undefined;
    if (terrain) (terrain.material as MeshLambertMaterial).color.lerp(new Color(P.ground), 0.05);
    if (sunRef.current) sunRef.current.color.lerp(new Color(P.light), 0.05);
    const mm = mistRef.current?.material as { opacity: number } | undefined; if (mm) mm.opacity += (mist - mm.opacity) * 0.06;
    const fm = fliesRef.current?.material as { opacity: number } | undefined; if (fm) fm.opacity += (flies - fm.opacity) * 0.04;
  });
  return null;
}
