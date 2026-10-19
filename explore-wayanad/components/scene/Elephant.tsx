"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { CatmullRomCurve3, DoubleSide, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader, Vector3 } from "three";
import CARDS from "@/data/vegetation.json";
import { height } from "@/lib/terrain";
import { FOREST, driveT7 } from "@/lib/drive";
import { scrollState } from "@/lib/scrollState";

/* The crossing (Act 7): while the drive holds (FOREST.hold), an elephant walks out of the trees on the right, across
 * the road ahead and into the trees on the left. A side-on cut-out (public/vegetation/elephant.webp, generated, not a
 * photo of a real animal), turned to face the camera so its flank shows; a slow heave in its step. Units of 10 m. */
const ELEPHANT = { height: 0.29, ahead: 3.2, from: 1.6, to: -1.6, walk: [0.43, 0.66] as const, sway: 0.004 };

export default function Elephant({ curve }: { curve: CatmullRomCurve3 }) {
  const { mesh, at, across } = useMemo(() => {
    // where the camera stands during the hold, and the spot the elephant crosses, ELEPHANT.ahead along the road
    const L = curve.getLength(), tHold = driveT7(FOREST.hold[0]), tCross = Math.min(0.999, tHold + ELEPHANT.ahead / L);
    const at = curve.getPointAt(tCross), tan = curve.getTangentAt(tCross).setY(0).normalize();
    const across = new Vector3(-tan.z, 0, tan.x); // toward the driver's right → left as it walks
    const map = new TextureLoader().load("/vegetation/elephant.webp");
    map.colorSpace = SRGBColorSpace;
    const w = ELEPHANT.height * CARDS.elephant.aspect, geo = new PlaneGeometry(w, ELEPHANT.height);
    geo.translate(0, ELEPHANT.height / 2, 0);
    const mesh = new Mesh(geo, new MeshStandardMaterial({ map, alphaTest: 0.5, side: DoubleSide, roughness: 0.95 }));
    mesh.castShadow = true;
    mesh.visible = false;
    mesh.name = "elephant";
    return { mesh, at, across };
  }, [curve]);

  useFrame(({ camera, clock }) => {
    const [w0, w1] = ELEPHANT.walk, p = scrollState.progress;
    mesh.visible = scrollState.act === "forest" && p > w0 - 0.02 && p < w1 + 0.02;
    if (!mesh.visible) return;
    const k = Math.min(1, Math.max(0, (p - w0) / (w1 - w0))), offset = ELEPHANT.to * k + ELEPHANT.from * (1 - k);
    const x = at.x - across.x * offset, z = at.z - across.z * offset;
    mesh.position.set(x, height(x, z) - 0.01 + Math.abs(Math.sin(clock.elapsedTime * 2.2)) * ELEPHANT.sway, z);
    // face the camera (so the flank shows), the head leading the way it walks: the image's head is on its left
    mesh.rotation.set(0, Math.atan2(camera.position.x - x, camera.position.z - z), 0);
    const leftward = across.clone().multiplyScalar(-1), right = new Vector3(Math.cos(mesh.rotation.y), 0, -Math.sin(mesh.rotation.y));
    mesh.scale.x = right.dot(leftward) > 0 ? -1 : 1;
  });
  return <primitive object={mesh} />;
}
