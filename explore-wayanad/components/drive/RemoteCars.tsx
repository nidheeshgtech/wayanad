"use client";
import { use, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, CanvasTexture, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, SRGBColorSpace, Sprite, SpriteMaterial, Vector3, type Material } from "three";
import { loadVehicle } from "@/lib/vehicleAssets";
import { paintedCar } from "@/lib/carModel";
import { game } from "@/lib/game";
import { net, remoteState, type Snap } from "@/lib/net";
import { carOf, colourOf, type Choice } from "@/data/cars";

/* Other drivers in your room (lib/net), on the same road, in the car and paint they chose (data/cars.ts), placed with
 * the same road maths as PlayerCar (s along the curve, lat across it, psi off its direction, pitched with the slope),
 * a name above. They pass through you and through your traffic (each player has their own): no collisions over the
 * network. Only the nearest are drawn — the closest few as their actual car (lib/carModel: loaded the first time
 * someone near you drives it, then shared), the rest as a light SUV in their colour (~10 draw calls instead of ~40)
 * that reads the same at a distance; fewer of both on phones. The cars are fixed pools, so drivers coming and going
 * never allocate. Units of 10 m. */
const VIEW = 50;
const COUNT = { full: 3, lite: 9 }, SMALL = { full: 2, lite: 6 };

/** A name plate: white on the site's dark green, sized to the name. */
function plate(name: string) {
  const c = document.createElement("canvas"), g = c.getContext("2d")!, font = "500 44px 'Instrument Sans', Arial, sans-serif";
  g.font = font; const w = Math.ceil(g.measureText(name).width) + 48;
  c.width = w; c.height = 72;
  g.font = font; g.fillStyle = "rgba(14, 31, 26, 0.82)"; g.beginPath(); g.roundRect(0, 0, w, 72, 36); g.fill();
  g.fillStyle = "#eef2ee"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, w / 2, 38);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  return { texture: t, aspect: w / 72 };
}

/** `source` scaled to `length` (units), wheels on the ground, centred: a fresh copy. */
function sized(source: Group, length: number) {
  const m = source.clone(true), box = new Box3().setFromObject(m), size = box.getSize(new Vector3());
  m.scale.setScalar(length / size.z); m.updateMatrixWorld(true);
  const b = new Box3().setFromObject(m), c = b.getCenter(new Vector3());
  m.position.set(-c.x, -b.min.y, -c.z);
  return m;
}

const ready = new Map<string, Group>(); // painted cars that have finished loading, by "car:colour"
const keyOf = (c: Choice) => `${c.car}:${c.colour}`;

type Slot = { root: Group; tag: Sprite; id: number; name: string; detailed: boolean; key: string; paint: MeshStandardMaterial | null };

export default function RemoteCars({ curve, small }: { curve: CatmullRomCurve3; small: boolean }) {
  const lite = use(loadVehicle("/models/traffic/suv.glb", { merged: true }));
  const pool = useMemo(() => {
    const n = small ? SMALL : COUNT;
    const make = (detailed: boolean): Slot => {
      const root = new Group(); root.visible = false; root.name = "remote-car";
      const tag = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false })); tag.renderOrder = 5;
      let paint: MeshStandardMaterial | null = null;
      if (!detailed) {
        // the light SUV: its body ("White") gets this slot's own paint material, recoloured per driver
        const m = sized(lite, 0.42);
        m.traverse((o) => {
          const mesh = o as Mesh; if (!mesh.isMesh) return;
          const mat = mesh.material as Material;
          if (/white/i.test(mat.name)) { paint ??= (mat as MeshStandardMaterial).clone(); mesh.material = paint; }
        });
        root.add(m);
      }
      return { root, tag, id: -1, name: "", detailed, key: "", paint };
    };
    return [...Array.from({ length: n.full }, () => make(true)), ...Array.from({ length: n.lite }, () => make(false))];
  }, [lite, small]);
  const group = useMemo(() => { const g = new Group(); g.name = "remote-cars"; for (const p of pool) g.add(p.root, p.tag); return g; }, [pool]);
  const tmp = useMemo(() => ({ p: new Vector3(), tan: new Vector3(), left: new Vector3(), fwd: new Vector3(), look: new Vector3() }), []);

  useFrame(({ camera }) => {
    const L = curve.getLength(), now = performance.now(), T = tmp;
    // the nearest drivers with fresh news, on the road you're on (the drive's first leg)
    const near: { id: number; name: string; car: Choice; st: Snap; d: number }[] = [];
    if (game.leg === 0) for (const r of net.remotes.values()) {
      const st = remoteState(r, now, {} as Snap);
      if (!st || Math.abs(st.s - game.s) > VIEW) continue;
      // one right where you are (everyone starts at Adivaram) would sit inside your car: not drawn until you're apart
      if (Math.abs(st.s - game.s) < 0.45 && Math.abs(st.lat - game.lat) < 0.2) continue;
      near.push({ id: r.id, name: r.name, car: r.car, st, d: Math.abs(st.s - game.s) });
    }
    near.sort((a, b) => a.d - b.d); near.length = Math.min(near.length, pool.length);
    // the closest few get their actual car once it has loaded (until then, the light one); a driver moving between
    // the two sets changes slot (and plate)
    const fullCount = pool.filter((p) => p.detailed).length;
    const wantsFull = near.map((n, i) => {
      if (i >= fullCount) return false;
      const k = keyOf(n.car);
      if (!ready.has(k)) void paintedCar(n.car).then((g) => ready.set(k, g));
      return ready.has(k);
    });
    for (const slot of pool) {
      const i = near.findIndex((n) => n.id === slot.id);
      if (slot.id >= 0 && (i < 0 || wantsFull[i] !== slot.detailed)) slot.id = -1;
    }
    for (const [i, n] of near.entries()) {
      const detailed = wantsFull[i];
      let slot = pool.find((s) => s.id === n.id);
      if (!slot) { slot = pool.find((s) => s.id < 0 && s.detailed === detailed); if (!slot) continue; slot.id = n.id; slot.name = ""; }
      // their car and paint: the detailed model swapped in, or the light one recoloured
      const k = keyOf(n.car);
      if (slot.key !== k) {
        slot.key = k;
        if (slot.detailed) { slot.root.clear(); slot.root.add(sized(ready.get(k)!, carOf(n.car.car).length / 10)); }
        else slot.paint?.color.set(colourOf(n.car.colour).hex);
      }
      if (slot.name !== n.name) {
        slot.name = n.name;
        const { texture, aspect } = plate(n.name), m = slot.tag.material;
        m.map?.dispose(); m.map = texture; m.needsUpdate = true;
        slot.tag.scale.set(0.075 * aspect, 0.075, 1);
      }
      const t = Math.min(1, Math.max(0, n.st.s / L));
      curve.getPointAt(t, T.p); curve.getTangentAt(t, T.tan);
      T.left.set(T.tan.z, 0, -T.tan.x).normalize();
      T.p.addScaledVector(T.left, n.st.lat); T.p.y -= 0.588;
      const rise = curve.getPointAt(Math.min(1, (n.st.s + 0.2) / L)).y - curve.getPointAt(Math.max(0, (n.st.s - 0.2) / L)).y;
      T.fwd.copy(T.tan).setY(0).normalize().multiplyScalar(Math.cos(n.st.psi)).addScaledVector(T.left, Math.sin(n.st.psi)).setY(rise / 0.4).normalize();
      slot.root.position.copy(T.p); slot.root.lookAt(T.look.copy(T.p).add(T.fwd)); slot.root.visible = true;
      slot.tag.position.copy(T.p).setY(T.p.y + 0.24); slot.tag.visible = true;
      // a name right at the lens fades out instead of filling the screen
      slot.tag.material.opacity = Math.min(1, Math.max(0, (camera.position.distanceTo(slot.tag.position) - 0.5) / 0.6));
    }
    for (const slot of pool) if (slot.id < 0) { slot.root.visible = false; slot.tag.visible = false; }
  });
  return <primitive object={group} />;
}
