"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CatmullRomCurve3, Group, Vector3 } from "three";
import { personHeight, type PersonId } from "@/data/drivers";
import { loadCast, makeActor, settleHands, type Actor, type Move } from "@/lib/people";
import { PLAZA, stops, type Stop } from "@/lib/stops";
import { whenReady } from "@/lib/loading";
import { weather } from "@/lib/weather";
import { quality } from "@/lib/quality";
import { CAFE } from "./Stops";

/* The people at the roadside stops (lib/stops, components/scene/Stops): at the Lakkidi View Point, tourists at the
 * railing taking photos and taking in the view, a family by the telescope, an old couple with their chaya in the gazebo,
 * riders and students at the café; at each chai kada its owner behind the counter and a few customers — sipping,
 * chatting, sitting on the bench. Real people (data/drivers TOURISTS and the road's own folk), playing the stops'
 * gestures (lib/people). Loaded as you come near a stop (light copies on phones), made one a frame, kept; drawn within
 * ~350 m, moving within ~250 m. In the rain the railing empties, and a tourist in a poncho stays. Units of 10 m. */
type Spot = { id: PersonId; x: number; z: number; face: number; move: Move; rain?: "only" | "no"; small?: boolean };
const NEAR = { load: 80, show: 35, move: 25 };

const W = PLAZA.w, D = PLAZA.d, GZ = { x: W * 0.33, z: D * 0.55 };
// `small`: kept on phones too (they get fewer)
const VIEWPOINT: Spot[] = [
  { id: "chaiman", x: CAFE.x, z: CAFE.z + 0.2, face: Math.PI, move: "talk", small: true },
  { id: "biker", x: CAFE.x - 0.08, z: 0.0, face: 0.15, move: "drink", small: true },
  { id: "collegeboy", x: CAFE.x + 0.1, z: -0.01, face: -0.5, move: "drink" },
  { id: "collegegirl", x: CAFE.x + 0.2, z: 0.07, face: -1.6, move: "chat" },
  { id: "tourist", x: 0.12, z: D - 0.14, face: 0, move: "phone", rain: "no", small: true },
  { id: "kurti", x: 0.2, z: D - 0.14, face: 0.1, move: "gaze", rain: "no", small: true },
  { id: "dad", x: -0.48, z: D - 0.17, face: 0, move: "gaze", rain: "no", small: true },
  { id: "kurti", x: -0.58, z: D - 0.2, face: 0.5, move: "chat", rain: "no" },
  { id: "boy", x: -0.37, z: D - 0.24, face: 0, move: "idle", rain: "no", small: true },
  { id: "backpacker", x: 0.62, z: D - 0.14, face: 0.25, move: "gaze", rain: "no", small: true },
  { id: "poncho", x: 0.4, z: D - 0.15, face: -0.1, move: "phone", rain: "only", small: true },
  { id: "uncle", x: GZ.x, z: GZ.z - 0.12, face: 0, move: "sitdrink", small: true },
  { id: "mum", x: GZ.x + 0.02, z: GZ.z + 0.12, face: Math.PI, move: "sitdrink" },
  { id: "granny", x: GZ.x + 0.2, z: GZ.z + 0.05, face: -Math.PI / 2, move: "idle" },
  { id: "saree", x: -W * 0.3, z: D - 0.42, face: 0, move: "sitdrink", rain: "no" },
  { id: "lungi", x: 0.25, z: 0.32, face: 2.6, move: "talk" },
];
// a chai kada: the owner behind the counter, customers in front (one on the bench or a stool, facing the road)
const OWNERS: PersonId[] = ["lungi", "saree", "chaiman", "lungi", "churidar", "chaiman"];
const CUSTOMERS: PersonId[] = ["student", "biker", "tourist", "kurti", "conductor", "dad", "collegegirl", "uncle", "backpacker", "picker", "collegeboy", "mum", "rider", "school", "auto", "trekker", "mechanic", "estate"];
// (who sits: people whose models take the shared sitting clip well — the older-rig grandmother slumped over)
const SITTERS: PersonId[] = ["uncle", "saree", "tourist", "dad", "collegegirl", "student", "kurti", "mum"];
function kadaSpots(i: number): Spot[] {
  const c = (k: number) => k === 2 ? SITTERS[i % SITTERS.length] : CUSTOMERS[(i * 3 + k) % CUSTOMERS.length];
  return [
    { id: OWNERS[i % OWNERS.length], x: -0.02, z: 0.2, face: Math.PI, move: i % 2 ? "idle" : "talk", small: true },
    { id: c(0), x: -0.09, z: -0.14, face: 0.25, move: "drink", small: true },
    { id: c(1), x: 0.08, z: -0.16, face: -0.6, move: "chat", small: true },
    { id: c(2), x: 0.03, z: -0.05, face: Math.PI, move: "sitdrink", rain: "no" },
  ];
}

type Placed = { spot: Spot; stop: Stop; pos: Vector3; yaw: number; actor: Actor | null; phase: number };

export default function StopCrowds({ curve, small = false }: { curve: CatmullRomCurve3; small?: boolean }) {
  const placed = useMemo(() => {
    const list: Placed[] = [];
    let kada = 0;
    for (const st of stops(curve)) {
      const spots = st.kind === "viewpoint" ? VIEWPOINT : kadaSpots(kada++);
      const lift = st.kind === "viewpoint" ? 0 : 0.012;
      for (const spot of spots) {
        if (small && !spot.small) continue;
        const local = new Vector3(spot.x, lift, spot.z).applyAxisAngle(new Vector3(0, 1, 0), st.yaw);
        list.push({ spot, stop: st, pos: st.at.clone().add(local), yaw: st.yaw + spot.face, actor: null, phase: (list.length * 1.37) % 7 });
      }
    }
    return list;
  }, [curve, small]);

  const state = useRef({ group: new Group(), ready: new Map<string, Awaited<ReturnType<typeof loadCast>>>(), asked: new Set<string>(), go: false });
  useEffect(() => {
    const S = state.current; S.group.name = "stop-crowds";
    let gone = false;
    void whenReady().then(() => { if (!gone) S.go = true; });
    return () => { gone = true; for (const p of placed) { p.actor?.mixer.stopAllAction(); p.actor = null; } S.group.clear(); };
  }, [placed]);

  useFrame(({ camera }, dt) => {
    const S = state.current; if (!S.go) return;
    const rainy = weather.rain > 0.3, share = quality.people;
    let made = false;
    for (const p of placed) {
      const d = p.pos.distanceTo(camera.position);
      // (full models up close at the viewpoint on a desktop; light copies everywhere else)
      const lo = small || p.stop.kind !== "viewpoint", key = `${p.spot.id}${lo ? ":lo" : ""}`;
      if (d < NEAR.load && !S.asked.has(key)) { S.asked.add(key); loadCast(p.spot.id, lo).then((v) => S.ready.set(key, v), () => {}); }
      // (always some people at a stop, whatever the quality: at the lower levels only the few marked `small` — the
      // automatic quality on a phone steps people right down to none, and the stops stood empty)
      const wanted = d < NEAR.show && (share >= 0.35 || !!p.spot.small) && (p.spot.rain === "only" ? rainy : p.spot.rain === "no" ? !rainy : true);
      if (wanted && !p.actor && !made) {
        const src = S.ready.get(key);
        if (src) {
          const a = makeActor(p.spot.id, src[0], src[1], personHeight(p.spot.id) / 10); made = true;
          a.root.position.copy(p.pos); a.root.rotation.y = p.yaw;
          a.play(p.spot.move, 0); a.mixer.setTime(p.phase);
          S.group.add(a.root); p.actor = a;
        }
      }
      if (!p.actor) continue;
      p.actor.root.visible = wanted;
      if (wanted && d < NEAR.move) { p.actor.mixer.update(dt); settleHands(p.actor); }
    }
  });
  return <primitive object={state.current.group} />;
}
