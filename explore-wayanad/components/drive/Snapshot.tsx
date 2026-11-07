"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { game } from "@/lib/game";
import { archT } from "@/lib/terrain";
import { score } from "@/lib/score";
import { shot } from "@/lib/shareCard";

/* The picture on the share card (lib/shareCard): one frame of the drive as you come up to the Lakkidi arch, ~25 m
 * short of it, with the arch filling the road ahead — or, if the climb skipped that (started past it), the view at the
 * gate. Taken by rendering the frame once more and handing the canvas to toBlob straight after, while the picture is
 * still in it (the canvas isn't kept between frames). Once per climb. */
export default function Snapshot() {
  const { gl, scene, camera } = useThree();
  useFrame(() => {
    if (!game.started || game.leg !== 0 || shot.run === score.run || game.paused) return;
    const L = game.roadLength, arch = archT() * L;
    if (!L) return;
    const near = game.phase === "drive" && game.s > arch - 3 && game.s < arch - 1.5, atGate = game.phase === "gate";
    if (!near && !atGate) return;
    shot.run = score.run;
    gl.render(scene, camera);
    gl.domElement.toBlob((b) => { if (b) shot.blob = b; }, "image/jpeg", 0.9);
  });
  return null;
}
