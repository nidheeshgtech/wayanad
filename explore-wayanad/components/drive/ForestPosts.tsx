"use client";
/**
 * The Kerala Forest Department on the forest road (lib/forestPosts): at the sanctuary's edge a green board each way
 * (MUTHANGA WILDLIFE SANCTUARY, drive slowly, don't stop, don't feed the animals); at each forest check on the left
 * shoulder a small timber booth with a green roof, its striped boom raised, a forest guard standing by it (the cast's
 * guard: data/drivers), and 250 m before, the board with the limit. Units of 10 m.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, CanvasTexture, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SECTION } from "@/lib/terrain";
import { FOREST_POSTS, POST_WARN, SANCTUARY, stepForestPosts } from "@/lib/forestPosts";
import { loadCast, makeActor, type Actor } from "@/lib/people";
import { personHeight } from "@/data/drivers";
import { whenReady } from "@/lib/loading";

const ROAD_DROP = 0.588;
const ML = "'Noto Sans Malayalam','Malayalam Sangam MN',sans-serif";
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t;
}
const GREEN = "#1f5a32", CREAM = "#f3efe2";

export default function ForestPosts({ curve, small }: { curve: CatmullRomCurve3; small: boolean }) {
  const built = useMemo(() => {
    const root = new Group(); root.name = "forest-posts";
    const L = curve.getLength();
    const frame = (s: number) => {
      const t = Math.min(1, Math.max(0, s / L)), p = curve.getPointAt(t), tan = curve.getTangentAt(t).setY(0).normalize();
      return { p: p.setY(p.y - ROAD_DROP), tan, left: new Vector3(tan.z, 0, -tan.x), yaw: Math.atan2(tan.x, tan.z) };
    };
    const metal = new MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.5 });
    const timber = new MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.85 }), roof = new MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.7 });
    const stripes = canvasTex(128, 16, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#f4f1ea" : "#c62828"; x.fillRect(i * 16, 0, 16, 16); } });
    const boom = new MeshStandardMaterial({ map: stripes, roughness: 0.6 });
    const board = (key: string, draw: (x: CanvasRenderingContext2D) => void, w = 256, h = 200) => new MeshStandardMaterial({ map: canvasTex(w, h, draw), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.04, name: key });
    const limit = board("limit", (x) => {
      x.fillStyle = GREEN; x.fillRect(0, 0, 256, 200); x.strokeStyle = CREAM; x.lineWidth = 6; x.strokeRect(8, 8, 240, 184);
      x.fillStyle = CREAM; x.textAlign = "center"; x.font = "700 21px Arial, sans-serif"; x.fillText("KERALA FOREST DEPT", 128, 42);
      x.font = "600 18px Arial, sans-serif"; x.fillText("FOREST CHECK AHEAD", 128, 68);
      x.beginPath(); x.arc(128, 132, 46, 0, Math.PI * 2); x.fillStyle = "#fff"; x.fill(); x.lineWidth = 12; x.strokeStyle = "#d22a2a"; x.stroke();
      x.fillStyle = "#111"; x.font = "700 44px Arial, sans-serif"; x.fillText(String(SANCTUARY.limit), 128, 148);
    });
    const welcome = board("sanctuary", (x) => {
      x.fillStyle = GREEN; x.fillRect(0, 0, 512, 256); x.strokeStyle = CREAM; x.lineWidth = 8; x.strokeRect(10, 10, 492, 236);
      x.fillStyle = CREAM; x.textAlign = "center"; x.font = `700 34px ${ML}`; x.fillText("മുത്തങ്ങ വന്യജീവി സങ്കേതം", 256, 62, 470);
      x.font = "800 34px Arial, sans-serif"; x.fillText("MUTHANGA WILDLIFE SANCTUARY", 256, 108, 470);
      x.font = "600 24px Arial, sans-serif"; x.fillText(`Drive slowly · ${SANCTUARY.limit} km/h`, 256, 160); x.fillText("Don't stop · Don't feed the animals", 256, 198);
    }, 512, 256);
    const legs: BoxGeometry[] = [];
    const post = (at: Vector3, h: number) => legs.push(new BoxGeometry(0.01, h, 0.01).translate(at.x, at.y + h / 2, at.z));
    // the sanctuary's boards, one each way at its edge
    for (const [s, side, face] of [[SANCTUARY.from - 2, 1, Math.PI], [SANCTUARY.from + 2, -1, 0]] as const) {
      const f = frame(s), at = f.p.clone().addScaledVector(f.left, side * (SECTION.half + 0.2));
      for (const d of [-0.16, 0.16]) post(at.clone().addScaledVector(f.tan.clone().applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 2), d), 0.32);
      const m = new Mesh(new PlaneGeometry(0.42, 0.21), welcome); m.position.set(at.x, at.y + 0.38, at.z); m.rotation.y = f.yaw + face; root.add(m);
    }
    const guards: { at: Vector3; yaw: number }[] = [];
    for (const c of FOREST_POSTS) {
      const f = frame(c.s), side = SECTION.half + 0.22;
      // the booth: timber walls, a green roof, a window toward the road
      const booth = new Group(), b = f.p.clone().addScaledVector(f.left, side + 0.12); booth.position.copy(b); booth.rotation.y = f.yaw; root.add(booth);
      const box = (w: number, h: number, d: number, m: MeshStandardMaterial, x: number, y: number, z: number) => { const o = new Mesh(new BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = !small; o.receiveShadow = true; booth.add(o); };
      box(0.2, 0.22, 0.16, timber, 0, 0.11, 0); box(0.26, 0.02, 0.22, roof, 0, 0.235, 0);
      box(0.1, 0.06, 0.004, new MeshStandardMaterial({ color: 0x9fc6d6, roughness: 0.2, metalness: 0.3 }), 0, 0.15, -0.082);
      // the boom across the shoulder, raised
      const pivot = f.p.clone().addScaledVector(f.left, SECTION.half + 0.05);
      post(pivot, 0.08);
      const arm = new Mesh(new BoxGeometry(0.012, 0.012, 0.42), boom); arm.geometry.translate(0, 0, 0.21);
      arm.position.set(pivot.x, pivot.y + 0.08, pivot.z); arm.rotation.set(-1.15, f.yaw + Math.PI / 2, 0, "YXZ"); root.add(arm);
      // the board before it
      const w = frame(c.s - POST_WARN), bp = w.p.clone().addScaledVector(w.left, SECTION.half + 0.14);
      post(bp, 0.22);
      const sign = new Mesh(new PlaneGeometry(0.16, 0.125), limit); sign.position.set(bp.x, bp.y + 0.25, bp.z); sign.rotation.y = w.yaw + Math.PI; root.add(sign);
      guards.push({ at: f.p.clone().addScaledVector(f.left, SECTION.half + 0.06).addScaledVector(f.tan, -0.1), yaw: f.yaw + Math.PI + 0.9 });
    }
    root.add(new Mesh(mergeGeometries(legs), metal));
    return { root, guards };
  }, [curve, small]);

  // a forest guard at each check (the cast's guard, light copy), loaded once the road is ready
  const crew = useRef<{ actors: Actor[]; group: Group }>({ actors: [], group: new Group() });
  useEffect(() => {
    let gone = false; const C = crew.current;
    void whenReady().then(() => loadCast("guard", true)).then(([src, clips]) => {
      if (gone) return;
      for (const g of built.guards) {
        const a = makeActor("guard", src, clips, personHeight("guard") / 10);
        a.root.position.copy(g.at); a.root.rotation.y = g.yaw; a.play("talk", 0); a.mixer.setTime(g.at.x % 3);
        C.group.add(a.root); C.actors.push(a);
      }
    }, () => {});
    return () => { gone = true; C.actors.forEach((a) => a.mixer.stopAllAction()); C.actors = []; C.group.clear(); };
  }, [built]);

  useFrame(({ camera }, dt) => {
    stepForestPosts();
    for (const a of crew.current.actors) { const near = a.root.position.distanceTo(camera.position) < 20; a.root.visible = near; if (near) a.mixer.update(dt); }
  });
  return <><primitive object={built.root} /><primitive object={crew.current.group} /></>;
}
