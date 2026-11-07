"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BoxGeometry, CanvasTexture, CapsuleGeometry, CatmullRomCurve3, CylinderGeometry, DoubleSide, Group, Mesh,
  MeshStandardMaterial, PlaneGeometry, SphereGeometry, SRGBColorSpace, Sprite, SpriteMaterial, Vector3,
} from "three";
import { archT, height, roadShapeAt } from "@/lib/terrain";
import { game } from "@/lib/game";
import { bonus, score } from "@/lib/score";
import { award } from "@/lib/badges";

/* A chaya kada at the Lakkidi viewpoint, a little below the gateway: a small tea stall on stilts over the valley side,
 * behind the barrier, as along the churam — tin roof, a painted board, a counter with glass jars of snacks and a big
 * kettle steaming, a bunch of bananas hanging from the roof, the man who runs it. Stop beside it for a chai break:
 * once per climb, a bonus and a badge (lib/score, lib/badges); the HUD shows the tea (DriveHud). Units of 10 m. */
const STALL = { w: 0.32, d: 0.24, h: 0.26, counter: 0.1 }; // 3.2 m wide, 2.4 m deep, 2.6 m to the eaves
const STOP = { reach: 0.45, still: 0.03, hold: 1.2, points: 50 }; // within 4.5 m along the road, stopped 1.2 s

function board() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1d5e8c"; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = "#f2e6c4"; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
  g.fillStyle = "#ffd75e"; g.font = "700 54px Arial, Helvetica, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("TEA · SNACKS", 256, 52);
  g.fillStyle = "#f2e6c4"; g.font = "600 26px Arial, Helvetica, sans-serif";
  g.fillText("LAKKIDI VIEW POINT", 256, 97);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function steamTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export default function TeaStall({ curve }: { curve: CatmullRomCurve3 }) {
  const { group, at, steam } = useMemo(() => {
    const L = curve.getLength(), arch = archT() * L;
    // a straight, unwidened stretch 80–250 m below the gateway
    let best = arch - 12, bestTurn = Infinity;
    for (let s = arch - 25; s <= arch - 8; s += 0.5) {
      const a = curve.getTangentAt(Math.max(0, (s - 1) / L)), b = curve.getTangentAt(Math.min(1, (s + 1) / L));
      const turn = 1 - a.dot(b) + roadShapeAt(s / L).widen * 4;
      if (turn < bestTurn) { bestTurn = turn; best = s; }
    }
    const t = best / L, p = curve.getPointAt(t), tan = curve.getTangentAt(t).setY(0).normalize(), left = new Vector3(tan.z, 0, -tan.x).normalize();
    // the valley side: the lower ground a few metres off the road
    const probe = (side: number) => { const q = p.clone().addScaledVector(left, side * 1.0); return height(q.x, q.z); };
    const side = probe(1) < probe(-1) ? 1 : -1, out = left.clone().multiplyScalar(side);
    const road = p.y - 0.588, edge = 0.4 + roadShapeAt(t).widen + 0.24; // just past the barrier posts
    const centre = p.clone().addScaledVector(out, edge + STALL.d / 2); centre.y = road;

    const group = new Group(); group.name = "tea-stall";
    group.position.copy(centre); group.rotation.y = Math.atan2(-out.x, -out.z); // +z faces the road
    const mat = (color: string, extra: { metalness?: number; roughness?: number } = {}) => new MeshStandardMaterial({ color, roughness: 0.85, ...extra });
    const wood = mat("#6b4a2e"), plank = mat("#3e6fa0"), tin = mat("#8d8f8c", { metalness: 0.5, roughness: 0.55 }), rust = mat("#8a4b2a", { metalness: 0.3, roughness: 0.7 });
    const box = (w: number, h: number, d: number, m: MeshStandardMaterial, x: number, y: number, z: number) => {
      const b = new Mesh(new BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; group.add(b); return b;
    };
    const { w, d, h } = STALL;
    // floor, and stilts down to the hillside
    box(w, 0.012, d, wood, 0, -0.006, 0);
    for (const [x, z] of [[-w / 2 + 0.01, -d / 2 + 0.01], [w / 2 - 0.01, -d / 2 + 0.01], [-w / 2 + 0.01, d / 2 - 0.01], [w / 2 - 0.01, d / 2 - 0.01]]) {
      const world = new Vector3(x, 0, z).applyAxisAngle(new Vector3(0, 1, 0), group.rotation.y).add(centre);
      const drop = Math.max(0.02, road - height(world.x, world.z) + 0.02);
      box(0.014, drop, 0.014, wood, x, -drop / 2, z);
    }
    // back and side walls (painted planks), corner posts up to the roof
    box(w, h, 0.01, plank, 0, h / 2, -d / 2);
    for (const s of [-1, 1]) box(0.01, h * 0.55, d, plank, s * w / 2, h * 0.275, 0);
    for (const s of [-1, 1]) box(0.012, h + 0.02, 0.012, wood, s * (w / 2 - 0.006), (h + 0.02) / 2, d / 2 - 0.006);
    // the counter at the front, its top, and what's on it
    box(w - 0.02, STALL.counter, 0.03, plank, 0, STALL.counter / 2, d / 2 - 0.03);
    box(w, 0.006, 0.06, wood, 0, STALL.counter + 0.003, d / 2 - 0.03);
    const glass = new MeshStandardMaterial({ color: "#d9eef2", transparent: true, opacity: 0.45, roughness: 0.1 });
    const snacks = [mat("#d9902c"), mat("#e8c46a"), mat("#b5652a"), mat("#f0d68a")];
    for (let i = 0; i < 4; i++) {
      const x = -w / 2 + 0.06 + i * 0.035;
      const jar = new Mesh(new CylinderGeometry(0.012, 0.012, 0.03, 12), glass); jar.position.set(x, STALL.counter + 0.021, d / 2 - 0.03); group.add(jar);
      const fill = new Mesh(new CylinderGeometry(0.0105, 0.0105, 0.02, 10), snacks[i]); fill.position.set(x, STALL.counter + 0.016, d / 2 - 0.03); group.add(fill);
    }
    // the kettle (big aluminium tea pot) and a tray of pazhampori
    const alu = mat("#c9ccc8", { metalness: 0.8, roughness: 0.3 });
    const kettle = new Mesh(new CylinderGeometry(0.016, 0.02, 0.04, 16), alu); kettle.position.set(w / 2 - 0.07, STALL.counter + 0.026, d / 2 - 0.035); group.add(kettle);
    const spout = new Mesh(new CylinderGeometry(0.003, 0.004, 0.025, 8), alu); spout.position.set(w / 2 - 0.05, STALL.counter + 0.034, d / 2 - 0.035); spout.rotation.z = -1; group.add(spout);
    const tray = box(0.06, 0.004, 0.035, alu, 0.02, STALL.counter + 0.008, d / 2 - 0.03);
    const fritter = mat("#c9832b");
    for (let i = 0; i < 6; i++) { const f = new Mesh(new CapsuleGeometry(0.003, 0.012, 3, 6), fritter); f.rotation.z = Math.PI / 2; f.position.set(tray.position.x - 0.02 + (i % 3) * 0.02, STALL.counter + 0.013, d / 2 - 0.04 + Math.floor(i / 3) * 0.018); group.add(f); }
    // tin roof, sloping down toward the road with an overhang
    const roof = new Mesh(new PlaneGeometry(w + 0.06, d + 0.1), tin); roof.material.side = DoubleSide;
    roof.position.set(0, h + 0.015, 0.03); roof.rotation.x = -Math.PI / 2 + 0.22; roof.castShadow = true; group.add(roof);
    box(w + 0.06, 0.004, 0.008, rust, 0, h - 0.012, d / 2 + 0.08);
    // the board along the front
    const sign = new Mesh(new PlaneGeometry(w * 0.9, w * 0.9 / 4), new MeshStandardMaterial({ map: board(), roughness: 0.7 }));
    sign.position.set(0, h + 0.035, d / 2 + 0.055); sign.rotation.x = -0.12; group.add(sign);
    // a bunch of bananas hanging from the roof, as at every tea stall in Kerala
    const banana = mat("#e7c43c");
    const bunch = new Group(); bunch.position.set(-w / 2 + 0.05, h - 0.06, d / 2 - 0.02); group.add(bunch);
    for (let i = 0; i < 14; i++) { const b = new Mesh(new CapsuleGeometry(0.0035, 0.018, 3, 6), banana); const a = (i / 14) * Math.PI * 2; b.position.set(Math.cos(a) * 0.01, -i * 0.0025, Math.sin(a) * 0.01); b.rotation.set(Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6); bunch.add(b); }
    const stem = new Mesh(new CylinderGeometry(0.002, 0.002, 0.05, 6), mat("#5b4a2a")); stem.position.set(bunch.position.x, h - 0.03, bunch.position.z); group.add(stem);
    // the man who runs it: shirt, white mundu, behind the counter
    const skin = mat("#7a5038", { roughness: 0.7 }), shirt = mat("#c9d6e3"), mundu = mat("#f2f0e8");
    const man = new Group(); man.position.set(-0.03, 0, d / 2 - 0.09); group.add(man);
    const part = (geo: CapsuleGeometry | SphereGeometry, m: MeshStandardMaterial, y: number, x = 0) => { const o = new Mesh(geo, m); o.position.set(x, y, 0); o.castShadow = true; man.add(o); return o; };
    part(new CapsuleGeometry(0.02, 0.07, 4, 10), mundu, 0.055); part(new CapsuleGeometry(0.021, 0.05, 4, 10), shirt, 0.125);
    part(new SphereGeometry(0.014, 14, 12), skin, 0.18); part(new SphereGeometry(0.0145, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat("#1a1512"), 0.183);
    for (const s of [-1, 1]) { const arm = part(new CapsuleGeometry(0.006, 0.05, 4, 8), shirt, 0.12, s * 0.028); arm.rotation.x = -0.7; arm.position.z = 0.015; }
    // steam from the kettle
    const steamMat = new SpriteMaterial({ map: steamTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.5 });
    const steam: Sprite[] = [];
    for (let i = 0; i < 5; i++) { const sp = new Sprite(steamMat.clone()); sp.position.set(kettle.position.x + 0.02, kettle.position.y + 0.03, kettle.position.z); sp.userData.phase = i / 5; group.add(sp); steam.push(sp); }
    if (typeof window !== "undefined") (window as unknown as { __wayanadStall?: unknown }).__wayanadStall = { s: best, side }; // for testing
    return { group, at: best, steam };
  }, [curve]);

  useFrame(({ clock }, dt) => {
    game.stall = at;
    // steam drifting up and away
    const k = clock.elapsedTime;
    for (const sp of steam) {
      const u = (k * 0.35 + sp.userData.phase) % 1;
      sp.position.y = STALL.counter + 0.056 + u * 0.09; sp.position.x = STALL.w / 2 - 0.05 + Math.sin(u * 6 + sp.userData.phase * 9) * 0.008;
      sp.scale.setScalar(0.02 + u * 0.05); sp.material.opacity = 0.45 * (1 - u) * Math.min(1, u * 5);
    }
    // a chai break: stopped beside the stall, once per climb
    if (!game.started || game.phase !== "drive" || game.paused || game.leg !== 0 || game.teaRun === score.run) return;
    const near = Math.abs(game.s - at) < STOP.reach && Math.abs(game.speed) < STOP.still;
    game.teaWait = near ? game.teaWait + Math.min(dt, 0.1) : 0;
    if (game.teaWait >= STOP.hold) {
      game.teaRun = score.run; game.tea = performance.now(); game.teaWait = 0;
      bonus(STOP.points, "☕ Chai break!"); award("chaya");
    }
  });
  return <primitive object={group} />;
}
