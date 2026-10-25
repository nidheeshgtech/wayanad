"use client";
import { use, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, CanvasTexture, CatmullRomCurve3, Group, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from "three";
import { loadVehicle } from "@/lib/vehicleAssets";
import { game } from "@/lib/game";
import { net, remoteState, type Snap } from "@/lib/net";

/* Other drivers in your room (lib/net), on the same road: the same car as yours, placed with the same road maths as
 * PlayerCar (s along the curve, lat across it, psi off its direction, pitched with the slope), a name above it. They
 * pass through you and through your traffic (each player has their own): no collisions over the network. Only the
 * nearest are drawn — the closest few as your own detailed car (~40 draw calls each), the rest as a light SUV (~10)
 * that reads the same at a distance; fewer of both on phones. The cars are fixed pools, so drivers coming and going
 * never allocate. Units of 10 m. */
const LENGTH = 0.4, VIEW = 50;
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

export default function RemoteCars({ curve, small }: { curve: CatmullRomCurve3; small: boolean }) {
  const full = use(loadVehicle("/models/traffic/player-suv.glb", { merged: true }));
  const lite = use(loadVehicle("/models/traffic/suv.glb", { merged: true }));
  const pool = useMemo(() => {
    const n = small ? SMALL : COUNT;
    const make = (source: Group, detailed: boolean) => {
      const box = new Box3().setFromObject(source), size = box.getSize(new Vector3()), k = LENGTH / size.z;
      const root = new Group(), model = source.clone(true);
      model.scale.setScalar(k); model.updateMatrixWorld(true);
      const b = new Box3().setFromObject(model), c = b.getCenter(new Vector3());
      model.position.set(-c.x, -b.min.y, -c.z);
      const tag = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false })); tag.renderOrder = 5;
      root.add(model); root.visible = false; root.name = "remote-car";
      return { root, tag, id: -1, name: "", detailed };
    };
    return [...Array.from({ length: n.full }, () => make(full, true)), ...Array.from({ length: n.lite }, () => make(lite, false))];
  }, [full, lite, small]);
  const group = useMemo(() => { const g = new Group(); g.name = "remote-cars"; for (const p of pool) g.add(p.root, p.tag); return g; }, [pool]);
  const tmp = useMemo(() => ({ snap: {} as Snap, p: new Vector3(), tan: new Vector3(), left: new Vector3(), fwd: new Vector3(), look: new Vector3() }), []);

  useFrame(({ camera }) => {
    const L = curve.getLength(), now = performance.now(), T = tmp;
    // the nearest drivers with fresh news, on the road you're on (the drive's first leg)
    const near: { id: number; name: string; st: Snap; d: number }[] = [];
    if (game.leg === 0) for (const r of net.remotes.values()) {
      const st = remoteState(r, now, {} as Snap);
      if (!st || Math.abs(st.s - game.s) > VIEW) continue;
      // one right where you are (everyone starts at Adivaram) would sit inside your car: not drawn until you're apart
      if (Math.abs(st.s - game.s) < 0.45 && Math.abs(st.lat - game.lat) < 0.2) continue;
      near.push({ id: r.id, name: r.name, st, d: Math.abs(st.s - game.s) });
    }
    near.sort((a, b) => a.d - b.d); near.length = Math.min(near.length, pool.length);
    const fullCount = pool.filter((p) => p.detailed).length;
    // keep each driver in the same pool slot while they stay near (their name plate is made once)
    // the closest few get the detailed car: a driver moving between the two sets changes slot (and plate)
    for (const slot of pool) {
      const i = near.findIndex((n) => n.id === slot.id);
      if (slot.id >= 0 && (i < 0 || (i < fullCount) !== slot.detailed)) slot.id = -1;
    }
    for (const [i, n] of near.entries()) {
      const detailed = i < fullCount;
      let slot = pool.find((s) => s.id === n.id);
      if (!slot) { slot = pool.find((s) => s.id < 0 && s.detailed === detailed) ?? pool.find((s) => s.id < 0)!; slot.id = n.id; slot.name = ""; }
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
