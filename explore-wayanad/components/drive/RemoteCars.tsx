"use client";
import { use, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, CanvasTexture, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, SRGBColorSpace, Sprite, SpriteMaterial, Vector3, type Material } from "three";
import { loadVehicle } from "@/lib/vehicleAssets";
import { paintedCar } from "@/lib/carModel";
import { driverOf } from "@/data/drivers";
import { hideStandIn, loadCast, makeActor, poseSeat, seat, type Seat } from "@/lib/people";
import { game } from "@/lib/game";
import { net, remoteState, type Snap } from "@/lib/net";
import { carOf, colourOf, type Choice } from "@/data/cars";

/* Other drivers in your room (lib/net), on the same road, in the car and paint they chose (data/cars.ts), placed with
 * the same road maths as PlayerCar (s along the curve, lat across it, psi off its direction, pitched with the slope),
 * a name above. They pass through your traffic (each player has their own); you and they bump (lib/net collideRemotes),
 * except a driver first met already inside your car, who passes through until you're apart. Only the nearest are drawn — the closest few as their actual car (lib/carModel: loaded the first time
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

type Slot = { root: Group; tag: Sprite; id: number; name: string; detailed: boolean; key: string; paint: MeshStandardMaterial | null;
  /** their driver (data/drivers.ts) in the seat, once loaded (detailed slots only), and for which car+driver */
  seat: Seat | null; seatKey: string;
  /** the pose drawn: eased toward the played-back one so a late update's correction glides instead of popping */
  shown: { s: number; lat: number; psi: number; for: number } };

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
      return { root, tag, id: -1, name: "", detailed, key: "", paint, seat: null, seatKey: "", shown: { s: 0, lat: 0, psi: 0, for: -1 } };
    };
    return [...Array.from({ length: n.full }, () => make(true)), ...Array.from({ length: n.lite }, () => make(false))];
  }, [lite, small]);
  const group = useMemo(() => { const g = new Group(); g.name = "remote-cars"; for (const p of pool) g.add(p.root, p.tag); return g; }, [pool]);
  const tmp = useMemo(() => ({ p: new Vector3(), tan: new Vector3(), left: new Vector3(), fwd: new Vector3(), look: new Vector3() }), []);

  const snaps = useMemo(() => new Map<number, Snap>(), []);
  useFrame(({ camera }, dt) => {
    const L = curve.getLength(), now = performance.now(), T = tmp, ease = 1 - Math.exp(-Math.min(dt, 0.1) / 0.07);
    // the nearest drivers with fresh news, on the road you're on (the drive's first leg)
    const near: { id: number; name: string; car: Choice; st: Snap; d: number }[] = [];
    if (game.leg === 0) for (const r of net.remotes.values()) {
      let snap = snaps.get(r.id); if (!snap) { snap = {} as Snap; snaps.set(r.id, snap); }
      const st = remoteState(r, now, snap);
      if (!st || Math.abs(st.s - game.s) > VIEW) continue;
      // one inside your car (everyone starts at Adivaram) isn't drawn until you're apart: only one passing through you
      // (collideRemotes' ghost) or right inside — not one you're touching, nose to tail ~4 m apart (it used to vanish
      // whenever you bumped it: this hid anything within 4.5 m)
      if (r.ghost || (Math.abs(st.s - game.s) < 0.2 && Math.abs(st.lat - game.lat) < 0.1)) continue;
      near.push({ id: r.id, name: r.name, car: r.car, st, d: Math.abs(st.s - game.s) });
    }
    near.sort((a, b) => a.d - b.d); near.length = Math.min(near.length, pool.length);
    // the closest few get their actual car once it has loaded (until then, the light one); a driver moving between
    // the two sets changes slot (and plate)
    const fullCount = pool.filter((p) => p.detailed).length;
    const wantsFull = near.map((n, i) => {
      if (i >= fullCount && !carOf(n.car.car).bike) return false; // (a bike is never drawn as the stand-in SUV)
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
        if (slot.detailed) { slot.root.clear(); slot.seat?.actor.mixer.stopAllAction(); slot.seat = null; slot.seatKey = ""; slot.root.add(sized(ready.get(k)!, carOf(n.car.car).length / 10)); }
        else slot.paint?.color.set(colourOf(n.car.colour).hex);
      }
      // their driver at the wheel or on the bike (the light stand-in SUV has none); the built one until they've loaded.
      // Their car's steering wheel isn't kept apart in the shared model: it's put where a car that size has it
      const sk = `${k}:${n.car.driver}`;
      if (slot.detailed && slot.seatKey !== sk) {
        slot.seatKey = sk; slot.seat?.actor.root.removeFromParent(); slot.seat = null;
        const s0 = slot, len = carOf(n.car.car).length / 10, bike = !!carOf(n.car.car).bike, id = n.car.driver;
        void loadCast(id).then(([src, clips]) => {
          if (s0.seatKey !== sk) return;
          const wheel = bike ? null : new Vector3(-0.085 * len, 0.255 * len, 0.08 * len);
          s0.seat = seat(makeActor(id, src, clips, driverOf(id).height / 10), s0.root, bike, len, wheel);
          hideStandIn(s0.root);
        });
      }
      if (slot.name !== n.name) {
        slot.name = n.name;
        const { texture, aspect } = plate(n.name), m = slot.tag.material;
        m.map?.dispose(); m.map = texture; m.needsUpdate = true;
        slot.tag.scale.set(0.075 * aspect, 0.075, 1);
      }
      // the drawn pose moves with the played-back one, and only a sudden difference (a late update's correction) is
      // eased out over ~0.1 s — no lag behind where they are (bumps line up). A new driver here, or a jump, snaps
      const sh = slot.shown, far = Math.abs(n.st.s - sh.s) > 2 || Math.abs(n.st.lat - sh.lat) > 0.5;
      if (sh.for !== n.id || far) Object.assign(sh, { s: n.st.s, lat: n.st.lat, psi: n.st.psi, for: n.id });
      else {
        sh.s += n.st.v * Math.cos(n.st.psi) * Math.min(dt, 0.1); // carried along at its speed (so no lag), then eased onto it
        sh.s += (n.st.s - sh.s) * ease; sh.lat += (n.st.lat - sh.lat) * ease; sh.psi += (n.st.psi - sh.psi) * ease;
      }
      n.st = { ...n.st, s: sh.s, lat: sh.lat, psi: sh.psi };
      const t = Math.min(1, Math.max(0, n.st.s / L));
      curve.getPointAt(t, T.p); curve.getTangentAt(t, T.tan);
      T.left.set(T.tan.z, 0, -T.tan.x).normalize();
      T.p.addScaledVector(T.left, n.st.lat); T.p.y -= 0.588;
      const rise = curve.getPointAt(Math.min(1, (n.st.s + 0.2) / L)).y - curve.getPointAt(Math.max(0, (n.st.s - 0.2) / L)).y;
      T.fwd.copy(T.tan).setY(0).normalize().multiplyScalar(Math.cos(n.st.psi)).addScaledVector(T.left, Math.sin(n.st.psi)).setY(rise / 0.4).normalize();
      slot.root.position.copy(T.p); slot.root.lookAt(T.look.copy(T.p).add(T.fwd)); slot.root.visible = true;
      if (slot.seat && n.d < 8) poseSeat(slot.seat, slot.root, dt); // (posed only while close enough to see)
      slot.tag.position.copy(T.p).setY(T.p.y + 0.24); slot.tag.visible = true;
      // a name right at the lens fades out instead of filling the screen
      slot.tag.material.opacity = Math.min(1, Math.max(0, (camera.position.distanceTo(slot.tag.position) - 0.5) / 0.6));
    }
    for (const slot of pool) if (slot.id < 0) { slot.root.visible = false; slot.tag.visible = false; }
  });
  return <primitive object={group} />;
}
