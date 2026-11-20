"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CanvasTexture, CatmullRomCurve3, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Sprite, SpriteMaterial, Texture, TextureLoader, Vector3 } from "three";
import { ANIMALS, type AnimalId } from "@/data/animals";
import { SECTION, archT, bendTs, height, placesT, roadShapeAt } from "@/lib/terrain";
import { game } from "@/lib/game";
import { nightness } from "@/lib/theme";
import { onHonk } from "@/lib/horn";
import { collected, setHint, spotted } from "@/lib/stickers";
import { monkeySpots } from "./Monkeys";

/* The sticker book's animals by the road (drive mode): honk with one in view and close enough, and it's a sticker
 * (lib/stickers) — then it runs off into the trees. Side-view cut-outs (public/animals) turned to face the camera, on
 * the verge or the bank, where each is really seen: Nilgiri langurs on the forest bank between the hairpins, Malabar
 * giant squirrels around Lakkidi, peafowl walking the plateau verges, a great hornbill on a dead tree by Pookode Lake,
 * wild boar crossing the plateau road at night; on the forest road spotted deer, gaur and an elephant. Each spot is
 * there on some drives and not others. The hairpin monkeys are components/scene/Monkeys' (spotted at monkeySpots).
 * Units of 10 m. */
const RANGE = { small: 6, big: 9 };   // how close (units) a honk counts: 60 m for the small ones (monkeys, the squirrel), 90 m for the rest
const FLEE = { dur: 1.4, dist: 1.8 }; // runs this far off the road (units) over this long, shrinking into the trees
const CROSS = { ahead: 9, dur: 5 };   // the boar: crosses when you're this far behind it, taking this long

type Spot = { id: AnimalId; base: Vector3; out: Vector3; along: Vector3; root: Group; card: Mesh; flip: number; walk: number; phase: number;
  fled: number; cross: number; night: boolean; on: boolean; chance: number; road: "churam" | "forest" };

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

export default function Animals({ curve, forest }: { curve: CatmullRomCurve3; forest: CatmullRomCurve3 | null }) {
  const camera = useThree((s) => s.camera);
  const { group, spots, marker } = useMemo(() => {
    const group = new Group(); group.name = "animals";
    const loader = new TextureLoader(), maps = new Map<AnimalId, { mat: MeshStandardMaterial; aspect: number }>();
    for (const a of ANIMALS) {
      if (a.id === "macaque") continue;
      const mat = new MeshStandardMaterial({ alphaTest: 0.5, side: DoubleSide, roughness: 0.95 }), entry = { mat, aspect: 1 };
      loader.load(a.img, (t: Texture) => { t.colorSpace = SRGBColorSpace; mat.map = t; mat.needsUpdate = true; entry.aspect = t.image.width / t.image.height; for (const s of spots) if (s.id === a.id) fit(s); });
      maps.set(a.id, entry);
    }
    const plane = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const spots: Spot[] = [], up = new Vector3(0, 1, 0), r = rng(4242);
    const size = (id: AnimalId) => ANIMALS.find((a) => a.id === id)!.size / 10;
    const fit = (s: Spot) => { const h = size(s.id), m = maps.get(s.id)!; s.card.scale.set(h * m.aspect * s.flip, h, 1); };
    const trunk = new MeshStandardMaterial({ color: 0x3e3127, roughness: 1 });
    const add = (c: CatmullRomCurve3, road: Spot["road"], id: AnimalId, t: number, off: number, chance: number, night = false, lift = 0) => {
      t = Math.min(0.995, Math.max(0.005, t));
      const p = c.getPointAt(t), tan = c.getTangentAt(t).setY(0).normalize(), left = new Vector3().crossVectors(up, tan).normalize();
      const side = r() < 0.5 ? 1 : -1, out = left.clone().multiplyScalar(side);
      const base = p.clone().addScaledVector(out, SECTION.shoulder + off + (road === "churam" ? roadShapeAt(t).widen : 0));
      base.y = height(base.x, base.z) + lift;
      const root = new Group(), card = new Mesh(plane, maps.get(id)!.mat); card.castShadow = true; root.add(card);
      if (lift > 0) { // a dead tree to sit in: a bare trunk and a branch
        const stem = new Mesh(new CylinderGeometry(0.016, 0.03, lift + 0.05, 7).translate(0, -lift / 2, 0), trunk), arm = new Mesh(new CylinderGeometry(0.006, 0.008, 0.16, 5), trunk);
        arm.rotation.z = Math.PI / 2.4; arm.position.set(0.05, -0.01, 0); stem.castShadow = true; root.add(stem, arm);
      }
      root.position.copy(base); root.visible = false; group.add(root);
      const s: Spot = { id, base, out, along: tan.clone(), root, card, flip: r() < 0.5 ? 1 : -1, walk: 0, phase: r() * 6, fled: -1, cross: -1, night, on: false, chance, road };
      fit(s); spots.push(s);
    };
    // the drive from Adivaram: langurs between the hairpins, squirrels by Lakkidi, peafowl and the hornbill on the
    // plateau, boar at night toward Kalpetta
    const bends = bendTs(), gate = archT(), place = (name: string) => placesT().find((p) => p.name === name)?.t;
    for (const [a, b] of [[1, 2], [4, 5], [5, 6], [7, 8]]) if (bends[a] !== undefined && bends[b] !== undefined) add(curve, "churam", "langur", (bends[a] + bends[b]) / 2, 0.35 + r() * 0.4, 0.6);
    for (const k of [-0.012, 0.004, 0.014]) add(curve, "churam", "squirrel", gate + k, 0.3 + r() * 0.3, 0.55);
    const pookode = place("Pookode Lake"), vythiri = place("Vythiri"), chundale = place("Chundale"), kalpetta = place("Kalpetta");
    if (pookode !== undefined && chundale !== undefined) for (let i = 0; i < 4; i++) add(curve, "churam", "peacock", pookode + (chundale - pookode) * (0.1 + i * 0.25), 0.25 + r() * 0.3, 0.6);
    if (pookode !== undefined) for (const k of [-0.004, 0.006]) add(curve, "churam", "hornbill", pookode + k, 0.5 + r() * 0.3, 0.6, false, 0.7 + r() * 0.3);
    if (vythiri !== undefined && kalpetta !== undefined) for (let i = 0; i < 3; i++) add(curve, "churam", "boar", vythiri + (kalpetta - vythiri) * (0.15 + i * 0.3), 0.2, 0.8, true);
    // the forest road (Muthanga)
    if (forest) {
      for (const t of [0.42, 0.55, 0.71]) add(forest, "forest", "deer", t, 0.3 + r() * 0.4, 0.75);
      for (const t of [0.5, 0.77]) add(forest, "forest", "gaur", t, 0.5 + r() * 0.4, 0.7);
      add(forest, "forest", "elephant", 0.64, 0.7, 0.9);
    }
    // the marker over an animal you haven't got, while it's in range: an amber paw, a constant size on screen
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d")!; x.fillStyle = "#d9a441"; x.beginPath(); x.arc(64, 56, 46, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(44, 96); x.lineTo(84, 96); x.lineTo(64, 124); x.fill(); x.strokeStyle = "#fff"; x.lineWidth = 6; x.beginPath(); x.arc(64, 56, 46, 0, Math.PI * 2); x.stroke();
    x.font = "52px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("🐾", 64, 60);
    const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
    const marker = new Sprite(new SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
    marker.scale.set(0.075, 0.075, 1); marker.renderOrder = 10; marker.visible = false; marker.center.set(0.5, 0); group.add(marker);
    return { group, spots, marker };
  }, [curve, forest]);

  // a new set each drive: which spots have their animal today
  const run = useRef(-1);
  const roll = () => { const r = rng(1 + Math.floor(Math.random() * 1e6)); for (const s of spots) { s.on = r() < s.chance; s.fled = -1; s.cross = -1; } };

  // a honk: every animal in view and in range is spotted (a sticker if new), and runs
  const tmp = useRef(new Vector3());
  const inView = (p: Vector3, range: number) => {
    if (camera.position.distanceTo(p) > range) return false;
    const v = tmp.current.copy(p).project(camera);
    return v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95;
  };
  const head = (s: Spot) => tmp.current.copy(s.root.position).setY(s.root.position.y + (ANIMALS.find((a) => a.id === s.id)!.size / 20));
  const range = (id: AnimalId) => (id === "langur" || id === "squirrel" || id === "macaque" ? RANGE.small : RANGE.big);
  const now = () => performance.now() / 1000;
  useEffect(() => {
    const honked = () => {
      if (!game.started || game.phase !== "drive" || game.paused) return;
      for (const s of spots) if (s.root.visible && s.fled < 0 && inView(head(s).clone(), range(s.id))) { spotted(s.id); s.fled = now(); }
      for (const m of monkeySpots) if (game.leg === 0 && inView(m.clone().setY(m.y + 0.03), RANGE.small)) { spotted("macaque"); break; }
    };
    onHonk.add(honked);
    return () => { onHonk.delete(honked); setHint(null); };
  }, [spots]); // eslint-disable-line react-hooks/exhaustive-deps

  const hintT = useRef(0), marked = useRef<{ spot?: Spot; at?: Vector3 } | null>(null);
  useFrame((_, dt) => {
    if (!game.active) { group.visible = false; return; }
    group.visible = true;
    if (game.started && run.current !== game.reset) { run.current = game.reset; roll(); }
    const t = now(), dark = nightness() > 0.45, road = game.leg === 1 ? "forest" : "churam", car = camera.position;
    for (const s of spots) {
      const near = s.on && s.road === road && (!s.night || dark) && car.distanceToSquared(s.base) < 30 * 30;
      if (s.fled >= 0 && t - s.fled > FLEE.dur) { s.root.visible = false; continue; }
      s.root.visible = near;
      if (!near) continue;
      const p = s.root.position.copy(s.base);
      // the boar crosses the road ahead of you, from its side to the other
      if (s.id === "boar") {
        if (s.cross < 0 && car.distanceTo(s.base) < CROSS.ahead) s.cross = t;
        if (s.cross >= 0) { const k = Math.min(1, (t - s.cross) / CROSS.dur); p.addScaledVector(s.out, -k * 2 * (SECTION.shoulder + 0.2)); s.card.scale.x = Math.abs(s.card.scale.x) * (Vector3Dot(s.out, camera) > 0 ? -1 : 1); }
      }
      // a peacock walks slowly up and down the verge
      if (s.id === "peacock") p.addScaledVector(s.along, Math.sin(t * 0.25 + s.phase) * 0.25);
      // fleeing: off away from the road, sinking into the undergrowth
      if (s.fled >= 0) { const k = (t - s.fled) / FLEE.dur; p.addScaledVector(s.out, k * FLEE.dist); s.root.scale.setScalar(Math.max(0.01, 1 - k * k)); } else s.root.scale.setScalar(1);
      p.y = (s.id === "hornbill" ? s.base.y : height(p.x, p.z)) + Math.abs(Math.sin(t * 2 + s.phase)) * 0.002;
      s.root.rotation.y = Math.atan2(car.x - p.x, car.z - p.z); // the card turned to the camera
    }
    // the hint: an animal you haven't got, in view and in range
    if ((hintT.current -= dt) <= 0) {
      hintT.current = 0.3;
      const have = collected();
      let hint: AnimalId | null = null;
      marked.current = null;
      if (game.started && game.phase === "drive" && !game.paused) {
        for (const s of spots) if (s.root.visible && s.fled < 0 && !have.includes(s.id) && inView(head(s).clone(), range(s.id))) { hint = s.id; marked.current = { spot: s }; break; }
        if (!hint && !have.includes("macaque") && game.leg === 0) for (const m of monkeySpots) if (inView(m.clone().setY(m.y + 0.03), RANGE.small)) { hint = "macaque"; marked.current = { at: m }; break; }
      }
      setHint(hint);
    }
    const mk = marked.current;
    marker.visible = !!mk && !(mk.spot && mk.spot.fled >= 0);
    if (mk) {
      const top = mk.spot ? mk.spot.root.position.y + ANIMALS.find((a) => a.id === mk.spot!.id)!.size / 10 + 0.03 : mk.at!.y + 0.09;
      marker.position.set(mk.spot ? mk.spot.root.position.x : mk.at!.x, top + Math.abs(Math.sin(t * 4)) * 0.03, mk.spot ? mk.spot.root.position.z : mk.at!.z);
    }
  });
  return <primitive object={group} />;
}

/** Which way a boar crossing is heading on screen (its card flipped to walk that way). */
function Vector3Dot(out: Vector3, camera: { matrixWorld: { elements: number[] } }) {
  const e = camera.matrixWorld.elements; // the camera's right vector is its first column
  return -(out.x * e[0] + out.z * e[2]);
}
