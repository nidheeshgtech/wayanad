"use client";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, FogExp2, MathUtils, Points, Vector3, CatmullRomCurve3, DirectionalLight, Mesh, MeshStandardMaterial } from "three";
import { scrollState } from "@/lib/scrollState";
import { driveT } from "@/lib/drive";
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
    // clear sunny morning low down (aerial haze and valley mist come from lib/atmosphere), mist from 6, white at 7–8
    [0, 0.003, 0.08], [bends[2], 0.004, 0.12], [bends[5], 0.03, 0.35], [bends[6], 0.07, 0.55], [bends[8], 0.07, 0.55], [0.98, 0.003, 0],
  ];
  const i = Math.max(0, keys.findIndex(([k]) => k > t) - 1);
  const [t0, f0, m0] = keys[i], [t1, f1, m1] = keys[Math.min(i + 1, keys.length - 1)];
  const k = t1 > t0 ? MathUtils.smoothstep(t, t0, t1) : 1;
  return { fog: f0 + (f1 - f0) * k, mist: m0 + (m1 - m0) * k };
}
/* Act 1 camera: a seat in the bus, units of 10 m. Eye `eye` above the road centre (the barrier posts stand at the edges),
 * looking `ahead` down the road. The pace comes from lib/drive.ts (slow seat-level moments joined by mist); the heading
 * eases and is capped at `maxTurn` °/s while in view, and the cabin leans gently into bends.
 * `bob` is a barely-there vertical drift from the road surface: enough to feel moving, not enough to sway. */
const BUS = { eye: 0.28, lane: 0, ahead: 4, ease: 0.12, maxTurn: 60, lean: 0.35, maxLean: 1.2, bob: 0.004 };
const WHITE = new Color(0xffffff);
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
  const tmp = useRef(new Vector3()), look = useRef(new Vector3()), up = useRef(new Vector3(0, 1, 0)), heading = useRef(new Vector3()), aim = useRef(new Vector3()), yaw = useRef<number | null>(null);
  const side = useRef(new Vector3()), roll = useRef(0), odometer = useRef(0), last = useRef(new Vector3()), tint = useRef(new Color());
  const length = useMemo(() => curve.getLength(), [curve]);
  const { spots, end } = useMemo(() => {
    const end = curve.getPointAt(1);
    const onGround = ([x, y, z]: number[]) => { const wx = x + end.x, wz = z - PROTO_END_Z + end.z; return [wx, height(wx, wz) + y, wz]; };
    return {
      spots: Object.fromEntries(Object.entries(SPOTS).map(([k, [a, b]]) => [k, [onGround(a), onGround(b)]])),
      end,
    };
  }, [curve]);
  if (!scene.fog) { scene.fog = new FogExp2(PALETTE.churam.fog, 0.02); scene.background = new Color(PALETTE.churam.sky); }

  useFrame((_, delta) => {
    const { act, progress: p, hold } = scrollState;
    const P = PALETTE[act];
    const fog = scene.fog as FogExp2;

    /* ---- camera ---- */
    if (act === "churam") {
      const t = driveT(p);
      const pt = curve.getPointAt(t), ahead = curve.getPointAt(Math.min(0.999, t + BUS.ahead / length));
      // look where the road goes: the point BUS.ahead along it (round a hairpin that's the exit, never the bank beside you);
      // the easing and turn limit below filter out the small wobbles in the mapped centre line
      const target = Math.atan2(ahead.x - pt.x, ahead.z - pt.z);
      if (yaw.current === null) yaw.current = target;
      const cap = MathUtils.degToRad(BUS.maxTurn) * delta;
      // ease toward the target at the same rate whatever the frame rate (BUS.ease per frame at 60 fps)
      const ease = 1 - Math.pow(1 - BUS.ease, delta * 60);
      const step = MathUtils.clamp(Math.atan2(Math.sin(target - yaw.current), Math.cos(target - yaw.current)) * ease, -cap, cap);
      yaw.current += step;
      heading.current.set(Math.sin(yaw.current), 0, Math.cos(yaw.current));
      side.current.set(-heading.current.z, 0, heading.current.x); // driver's left
      odometer.current += pt.distanceTo(last.current.lengthSq() ? last.current : pt);
      last.current.copy(pt);
      // seat height the whole way: through the gateway and on into Lakkidi's shops (the owner's call; no drone lift)
      tmp.current.copy(pt).addScaledVector(side.current, BUS.lane).addScaledVector(up.current, BUS.eye - 0.6 + Math.sin(odometer.current * 2.1) * BUS.bob);
      camera.position.copy(tmp.current);
      look.current.copy(tmp.current).addScaledVector(heading.current, BUS.ahead);
      look.current.y = ahead.y - 0.6 + BUS.eye * 0.7; // follow the climb, eyes a touch below the horizon
      aim.current.copy(look.current);
      // lean into the turn, like a cabin on its springs
      roll.current += (MathUtils.clamp(-step / Math.max(delta, 1e-3) * BUS.lean, -MathUtils.degToRad(BUS.maxLean), MathUtils.degToRad(BUS.maxLean)) - roll.current) * 0.05;
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
    // ease the aim too, so the view never snaps to a new target (hairpins, act changes)
    if (aim.current.lengthSq() === 0) aim.current.copy(look.current);
    if (act !== "churam") aim.current.lerp(look.current, 0.06);
    camera.lookAt(aim.current);
    if (act === "churam") camera.rotateZ(roll.current);

    /* ---- mood ---- */
    let fogDensity = P.fogDensity, mist = P.mist;
    if (act === "churam") ({ fog: fogDensity, mist } = churamMood(driveT(p), scrollState.bends));
    // fireflies come out through Stay, peak at Night, and fade over Plan
    const flies = act === "stay" ? P.flies * p : act === "plan" ? 0.9 * (1 - p) : P.flies;
    fog.color.lerp(new Color(P.fog), 0.05);
    (scene.background as Color).lerp(new Color(P.sky), 0.05);
    fog.density += (fogDensity - fog.density) * (fogDensity > fog.density + 0.02 ? 0.25 : 0.08); // close in fast, clear slowly
    const terrain = scene.getObjectByName("terrain") as Mesh | undefined;
    // the ground's colour comes from its textures now; the act only tints it, so lift the palette's ground toward white
    if (terrain) (terrain.material as MeshStandardMaterial).color.lerp(tint.current.set(P.ground).lerp(WHITE, 0.8), 0.05);
    if (sunRef.current) sunRef.current.color.lerp(new Color(P.light), 0.05);
    const mm = mistRef.current?.material as { opacity: number } | undefined; if (mm) mm.opacity += (mist - mm.opacity) * 0.06;
    const fm = fliesRef.current?.material as { opacity: number } | undefined; if (fm) fm.opacity += (flies - fm.opacity) * 0.04;
  });
  return null;
}
