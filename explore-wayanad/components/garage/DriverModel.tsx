"use client";
import { use, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { driverOf, type DriverId } from "@/data/drivers";
import { loadCast, makeActor } from "@/lib/people";

/** A driver (data/drivers.ts) standing, playing their idle (lib/people). Feet on y = 0, facing +z, their height in the
 * caller's units (`unit` per metre). */
type V3 = [number, number, number];
export default function DriverModel({ id, unit = 1, position, rotation }: { id: DriverId; unit?: number; position?: V3; rotation?: V3 }) {
  const [src, clips] = use(loadCast(id));
  const actor = useMemo(() => makeActor(id, src, clips, driverOf(id).height * unit), [src, clips, id, unit]);
  useEffect(() => () => { actor.mixer.stopAllAction(); }, [actor]);
  useFrame((_, dt) => actor.mixer.update(Math.min(dt, 0.1)));
  return <group position={position} rotation={rotation}><primitive object={actor.root} /></group>;
}
