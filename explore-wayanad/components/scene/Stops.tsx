"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, CanvasTexture, CatmullRomCurve3, Group, Sprite, SpriteMaterial, Vector3 } from "three";
import { height } from "@/lib/terrain";
import { PLAZA, stops, type Stop } from "@/lib/stops";
import { duskness, nightness } from "@/lib/theme";
import { bake, buildKada, buildTerrace, glowMaterials } from "./stopKit";

/* The churam's roadside stops (lib/stops): the Lakkidi View Point's terrace with its café (the chai break's stall,
 * components/drive/TeaStall) and the chai kadas along the climb. Each stop is baked into a few merged meshes and shown
 * only within ~600 m; the lanterns and bulbs glow with the evening; steam rises from the kettles nearby. The people in
 * them: StopCrowds. Units of 10 m. */
const SHOW = 60; // units: drawn within this distance of the camera

/** Where the viewpoint's café stands in the terrace's frame (its counter facing the road), and the café's place along the road. */
export const CAFE = { x: -PLAZA.w / 2 + 0.32, z: 0.06 };
export function cafeS(curve: CatmullRomCurve3) {
  const vp = stops(curve).find((s) => s.kind === "viewpoint");
  if (!vp) return 0;
  const x = new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), vp.yaw);
  return vp.s + x.dot(vp.along) * CAFE.x;
}

function steamTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

function build(st: Stop) {
  const root = new Group(); root.name = `stop-${st.kind}`;
  root.position.copy(st.at); root.rotation.y = st.yaw;
  if (st.kind === "viewpoint") {
    // the wall under the terrace reaches the lowest ground beneath its outer corners
    const o = st.out, a = st.along;
    let low = st.at.y;
    for (const u of [-PLAZA.w / 2, 0, PLAZA.w / 2]) for (const v of [PLAZA.d * 0.5, PLAZA.d]) { const x = st.at.x + a.x * u + o.x * v, z = st.at.z + a.z * u + o.z * v; low = Math.min(low, height(x, z)); }
    const terrace = buildTerrace(PLAZA.w, PLAZA.d, Math.min(3, Math.max(0.3, st.at.y - low + 0.15)));
    const cafe = buildKada(1, false); cafe.position.set(CAFE.x, 0, CAFE.z); terrace.add(cafe);
    root.add(bake(terrace));
  } else {
    root.add(bake(buildKada(st.style, st.valley)));
  }
  return root;
}

export default function Stops({ curve }: { curve: CatmullRomCurve3 }) {
  const { groups, steam, holder } = useMemo(() => {
    const list = stops(curve), groups = list.map(build);
    const map = steamTexture(), steam: { sp: Sprite; base: Vector3; phase: number; group: Group }[] = [];
    for (const g of groups) {
      g.updateMatrixWorld(true);
      g.traverse((o) => {
        if (o.name !== "steam") return;
        const base = o.getWorldPosition(new Vector3());
        for (let i = 0; i < 4; i++) {
          const sp = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0 }));
          sp.position.copy(base); steam.push({ sp, base, phase: i / 4, group: g });
        }
      });
    }
    // (the holder made with them: a second memo adding the same groups took them from the first — React runs a memo
    // twice in development, and the stops vanished there)
    const holder = new Group(); holder.name = "stops"; groups.forEach((g) => holder.add(g)); steam.forEach((s) => holder.add(s.sp));
    return { groups, steam, holder };
  }, [curve]);

  useFrame(({ camera, clock }) => {
    for (const g of groups) g.visible = g.position.distanceTo(camera.position) < SHOW;
    // lanterns and bulbs: barely lit by day, warm at dusk, bright at night
    const glow = 0.12 + duskness() * 0.9 + nightness() * 1.6;
    for (const m of glowMaterials()) m.emissiveIntensity = glow;
    const k = clock.elapsedTime;
    for (const s of steam) {
      if (!s.group.visible) { s.sp.visible = false; continue; }
      s.sp.visible = true;
      const u = (k * 0.35 + s.phase) % 1;
      s.sp.position.set(s.base.x + Math.sin(u * 6 + s.phase * 9) * 0.008, s.base.y + u * 0.09, s.base.z);
      s.sp.scale.setScalar(0.02 + u * 0.05); s.sp.material.opacity = 0.45 * (1 - u) * Math.min(1, u * 5);
    }
  });
  return <primitive object={holder} />;
}
