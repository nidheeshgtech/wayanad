"use client";
import { use, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, Group, Vector3 } from "three";
import { game } from "@/lib/game";
import { paintedCar } from "@/lib/carModel";
import { carOf, type Choice } from "@/data/cars";

/** Your own car or bike, standing where you left it while you drive one you took (lib/game `parked`, OnFoot): the
 * painted model at its own length, wheels on the road. Walk back to it and Enter swaps back. */
export default function ParkedCar({ choice }: { choice: Choice }) {
  const source = use(paintedCar(choice));
  const root = useMemo(() => {
    const m = source.clone(true), box = new Box3().setFromObject(m), size = box.getSize(new Vector3());
    m.scale.setScalar(carOf(choice.car).length / 10 / size.z); m.updateMatrixWorld(true);
    const b = new Box3().setFromObject(m), c = b.getCenter(new Vector3());
    m.position.set(-c.x, -b.min.y, -c.z);
    const g = new Group(); g.name = "parked-car"; g.add(m); g.visible = false;
    return g;
  }, [source, choice.car]);
  const shown = useRef(false);
  useFrame(() => {
    const P = game.parked;
    if (!P) { if (shown.current) { root.visible = false; shown.current = false; } return; }
    if (!shown.current) { root.position.set(P.x, P.y, P.z); root.quaternion.set(P.qx, P.qy, P.qz, P.qw); root.visible = true; shown.current = true; }
  });
  return <primitive object={root} />;
}
