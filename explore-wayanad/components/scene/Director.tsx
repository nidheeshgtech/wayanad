"use client";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Color, FogExp2, MathUtils, Points, Vector3, CatmullRomCurve3, DirectionalLight, Mesh, MeshStandardMaterial } from "three";
import { scrollState } from "@/lib/scrollState";
import { driveT, driveT2, driveT7, driveT8 } from "@/lib/drive";
import { mistPatch, weather } from "@/lib/weather";
import { PALETTE } from "@/data/acts";
import { height } from "@/lib/terrain";
import { game } from "@/lib/game";

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
    // the base: a little more haze higher up the ghat. Mist and cloud on top come from lib/weather, which varies by visit
    // (the storyboard's fixed white-out at 7–8 gave way to the owner's dynamic weather, 2026-10-19)
    [0, 0.004, 0.06], [bends[2], 0.005, 0.08], [bends[5], 0.008, 0.12], [bends[8], 0.008, 0.12], [0.98, 0.005, 0.06],
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
/* Act 2's end: over the last part of the act the camera rises `rise` units over Kalpetta, aim pushed `ahead` and down. */
const HUB = { from: 0.84, rise: 9, ahead: 10 };
/* Act 8: once the drive has stopped at the barrier (FOREST.arrive), the camera turns 180° over this act progress. */
const TURN_BACK = [0.58, 0.92, 25] as const; // act progress from, to; and units back along the road to look at
/* Churam sky and haze colours for clear and full cloud (lib/weather blends between them), and for thick mist. */
const SKY_CLEAR = new Color(0x6f9fcf), SKY_CLOUD = new Color(0x8494a2), SKY_STORM = new Color(0x48525a), FOG_STORM = new Color(0x7f888d);
const FOG_CLEAR = new Color(0xd3dee6), FOG_CLOUD = new Color(0xb9c3c8), FOG_MIST = new Color(0xd9dee0);
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

export default function Director({ curve, forest, sunRef, mistRef, fliesRef }: {
  curve: CatmullRomCurve3;
  /** the forest road (Acts 7–8), when loaded */
  forest: CatmullRomCurve3 | null;
  sunRef: React.MutableRefObject<DirectionalLight | null>;
  mistRef: React.MutableRefObject<Points | null>;
  fliesRef: React.MutableRefObject<Points | null>;
}) {
  const { scene, camera, gl } = useThree();
  const tmp = useRef(new Vector3()), look = useRef(new Vector3()), up = useRef(new Vector3(0, 1, 0)), heading = useRef(new Vector3()), aim = useRef(new Vector3()), yaw = useRef<number | null>(null);
  const side = useRef(new Vector3()), roll = useRef(0), odometer = useRef(0), last = useRef(new Vector3()), tint = useRef(new Color()), tmpSky = useRef(new Color()), tmpFog = useRef(new Color());
  const length = useMemo(() => curve.getLength(), [curve]);
  const forestLength = useMemo(() => forest?.getLength() ?? 1, [forest]);
  const lastRoad = useRef<CatmullRomCurve3 | null>(null);
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
    const onForest = !!forest && (act === "forest" || act === "border");
    const driving = act === "churam" || act === "kalpetta" || onForest;
    // drive mode (/drive): the chase camera behind the player's bus places the camera; the mood below still runs
    if (game.active) {
      // nothing: components/drive/PlayerBus.tsx
    } else if (driving) {
      const road = onForest ? forest! : curve, roadLength = onForest ? forestLength : length;
      const t = act === "churam" ? driveT(p) : act === "kalpetta" ? driveT2(p) : act === "forest" ? driveT7(p) : driveT8(p);
      const pt = road.getPointAt(t), ahead = road.getPointAt(Math.min(0.999, t + BUS.ahead / roadLength));
      // look where the road goes: the point BUS.ahead along it (round a hairpin that's the exit, never the bank beside you);
      // the easing and turn limit below filter out the small wobbles in the mapped centre line
      let target = Math.atan2(ahead.x - pt.x, ahead.z - pt.z);
      // at the border gate the camera turns round to face back west, down the road you came (storyboard, Act 8): toward
      // a point well back along it (the road behind curves, so "ahead + 180°" would face the bank), turning the short way
      if (act === "border") {
        const k = MathUtils.smoothstep(p, TURN_BACK[0], TURN_BACK[1]);
        if (k > 0) {
          const back = road.getPointAt(Math.max(0, t - TURN_BACK[2] / roadLength));
          const behind = Math.atan2(back.x - pt.x, back.z - pt.z), d = Math.atan2(Math.sin(behind - target), Math.cos(behind - target));
          target += d * k;
        }
      }
      // a different road (the forest acts are on another stretch of NH766): face along it at once, no swing
      if (yaw.current === null || lastRoad.current !== road) { yaw.current = target; lastRoad.current = road; }
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
      // arriving in Kalpetta, the storyboard's low aerial: rise above the hub and look down the road into town
      if (act === "kalpetta") {
        const k = MathUtils.smoothstep(p, HUB.from, 1);
        camera.position.y += k * HUB.rise;
        look.current.addScaledVector(heading.current, k * HUB.ahead).y -= k * HUB.rise * 0.6;
      }
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
      if (act === "border" && !forest && p > 0.55) {
        const k = (p - 0.55) / 0.45, z = -300 - PROTO_END_Z + end.z + k * 460, back = end.z + 84;
        look.current.set(end.x, height(end.x, back) + 10 - k * 4, z);
      }
    }
    // ease the aim too, so the view never snaps to a new target (hairpins, act changes)
    if (!game.active) {
      if (aim.current.lengthSq() === 0) aim.current.copy(look.current);
      if (!driving) aim.current.lerp(look.current, 0.06);
      camera.lookAt(aim.current);
      if (driving) camera.rotateZ(roll.current);
    }

    /* ---- mood ---- */
    let fogDensity = P.fogDensity, mist = P.mist;
    let sky = SKY_CLEAR, fogTint = FOG_CLEAR;
    if (driving) {
      const t = act === "churam" ? driveT(p) : act === "kalpetta" ? driveT2(p) : act === "forest" ? driveT7(p) : driveT8(p);
      // the churam's base haze rises with the ghat; the plateau keeps the haze it had at the top
      ({ fog: fogDensity, mist } = act === "churam" ? churamMood(t, scrollState.bends) : { fog: 0.005, mist: 0.06 });
      // weather: banks of mist along the road (some stretches clear), thicker overall in mist and drizzle; capped so the
      // road ahead stays readable (0.045 → the road 15 m ahead is ~95 % visible, 150 m ahead mostly hidden)
      fogDensity += weather.mist * (0.35 + 0.65 * mistPatch(t)) * 0.04 + weather.cloud * 0.003;
      mist = Math.max(mist, weather.mist * 0.55);
      sky = tmpSky.current.copy(SKY_CLEAR).lerp(SKY_CLOUD, weather.cloud).lerp(SKY_STORM, weather.gloom);
      fogTint = tmpFog.current.copy(FOG_CLEAR).lerp(FOG_CLOUD, weather.cloud).lerp(FOG_MIST, weather.mist * 0.6).lerp(FOG_STORM, weather.gloom * 0.8);
    }
    // fireflies come out through Stay, peak at Night, and fade over Plan
    const flies = act === "stay" ? P.flies * p : act === "plan" ? 0.9 * (1 - p) : P.flies;
    fog.color.lerp(driving ? fogTint : tmpFog.current.set(P.fog), 0.05);
    (scene.background as Color).lerp(driving ? sky : tmpSky.current.set(P.sky), 0.05);
    // overcast reads darker, but never by more than a few stops: exposure eases with the cloud
    // drive mode's showers go properly dark (weather.gloom)
    gl.toneMappingExposure += (1.15 - 0.2 * weather.cloud - 0.45 * weather.gloom - gl.toneMappingExposure) * 0.05;
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
