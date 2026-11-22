"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, Vector3, type Object3D } from "three";
import { game } from "@/lib/game";
import { readyRide } from "@/lib/garageModel";
import { rideOf } from "@/data/newGarage";
import type { Wheel } from "@/lib/autoWheels";

/**
 * Filming only (?film=<new-garage id>, for reels): one of the new garage's cars (data/newGarage) drawn in place of the
 * player's car — on its body, so it rides the same springs — with its wheels rolling as you drive. The player's own car
 * is still there underneath (its physics, its camera), just not drawn. Another car: window.__filmCar("g-r34").
 */
export default function FilmCar({ id: first }: { id: string }) {
  const [id, setId] = useState(first);
  useEffect(() => { (window as unknown as { __filmCar?: (id: string) => void }).__filmCar = setId; }, []);
  const scene = useThree((s) => s.scene);
  const [ready, setReady] = useState<{ model: Object3D; wheels: Wheel[] } | null>(null);
  useEffect(() => { const r = rideOf(id); if (!r) return; let live = true; void readyRide(r).then((x) => { if (live) setReady(x); }); return () => { live = false; }; }, [id]);
  const seated = useRef<Object3D | null>(null), tmp = useMemo(() => new Vector3(), []), tmp2 = useMemo(() => new Vector3(), []);
  const holder = useMemo(() => { const g = new Group(); g.name = "film-car"; g.scale.setScalar(0.1); return g; }, []);

  useFrame((_, dt) => {
    const car = scene.getObjectByName("player-car");
    if (!car || !ready) return;
    const body = car.children[0] ?? car;
    if (holder.parent !== body) body.add(holder);
    if (ready.model.parent !== holder) { holder.clear(); holder.add(ready.model); }
    // the player's own car (everything on it but this) not drawn
    for (const c of car.children) if (c !== body) c.visible = false;
    for (const c of body.children) if (c !== holder) c.visible = false;
    // the player's driver sits in your car's seat, not this one's (their head comes through its roof): not drawn
    // either while you drive (found once: the character nearest the car)
    if (!seated.current || !seated.current.parent) {
      seated.current = null; let best = 0.5;
      scene.traverse((o) => { if (o.name !== "Armature" || !o.parent?.parent) return; const d = o.getWorldPosition(tmp).distanceTo(car.getWorldPosition(tmp2)); if (d < best) { best = d; seated.current = o.parent.parent; } });
    }
    if (seated.current) seated.current.visible = game.foot.on;
    // the wheels roll with the distance driven (metres / their radius)
    const d = game.paused ? 0 : game.speed * Math.min(dt, 0.1) * 10;
    for (const w of ready.wheels) w.pivot.rotateX(d / Math.max(0.15, w.radius));
  });
  return null;
}
