"use client";
import { use, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { AnimationMixer, Box3, Group, Vector3, type AnimationClip, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { driverModel, driverOf, type DriverId } from "@/data/drivers";

/** A driver (data/drivers.ts) standing, playing their idle: a rigged model from public/models/drivers, loaded once and
 * cloned with its skeleton. Feet on y = 0, facing +z, `height` metres tall in the caller's units (`unit` per metre). */
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<{ scene: Object3D; clips: AnimationClip[] }>>();
export function loadDriver(id: DriverId) {
  const url = driverModel(id);
  let p = cache.get(url);
  if (!p) { p = loader.loadAsync(url).then((g) => ({ scene: g.scene, clips: g.animations })); cache.set(url, p); }
  return p;
}

type V3 = [number, number, number];
export default function DriverModel({ id, unit = 1, position, rotation }: { id: DriverId; unit?: number; position?: V3; rotation?: V3 }) {
  const src = use(loadDriver(id));
  const { root, mixer } = useMemo(() => {
    // the models don't all face the same way: turn each to face +z, from its hips (left hip − right hip) × up
    const body = clone(src.scene), turn = new Group(); turn.add(body); turn.updateMatrixWorld(true);
    const hip = (n: string) => body.getObjectByName(n)?.getWorldPosition(new Vector3());
    const L = hip("LeftUpLeg"), R = hip("RightUpLeg");
    if (L && R) { const f = L.sub(R).cross(new Vector3(0, 1, 0)); turn.rotation.y = -Math.atan2(f.x, f.z); turn.updateMatrixWorld(true); }
    // measure after the skeleton is posed (a skinned mesh's box comes from its bones)
    const box = new Box3().setFromObject(turn, true), size = box.getSize(new Vector3()), c = box.getCenter(new Vector3());
    const k = (driverOf(id).height * unit) / size.y;
    const fit = new Group(); fit.add(turn);
    fit.scale.setScalar(k); fit.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    body.traverse((o) => { o.frustumCulled = false; (o as { castShadow?: boolean }).castShadow = true; });
    const root = new Group(); root.add(fit);
    const mixer = new AnimationMixer(body);
    if (src.clips[0]) mixer.clipAction(src.clips[0]).play();
    return { root, mixer };
  }, [src, id, unit]);
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);
  useFrame((_, dt) => mixer.update(Math.min(dt, 0.1)));
  return <group position={position} rotation={rotation}><primitive object={root} /></group>;
}
