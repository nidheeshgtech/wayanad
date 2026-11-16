"use client";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CatmullRomCurve3, Quaternion, Vector3, type PerspectiveCamera } from "three";
import { game } from "@/lib/game";
import { score, } from "@/lib/score";
import { shot } from "@/lib/shareCard";
import { PLAZA, stops } from "@/lib/stops";
import { vista, VISTA, vistaLength, vistaTime } from "@/lib/vista";

/* The camera sweep at the Lakkidi View Point (lib/vista): from wherever the chase camera is, out to the railing's edge
 * and over it, looking down the valley, panning slowly across it, then back to the car. Runs after the player car's
 * camera each frame (PlayerCar sets it, this bends it). Touch the throttle and it hurries back. A frame from the middle
 * of it is kept for sharing. Units of 10 m. */
const ease = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

export default function Vista({ curve }: { curve: CatmullRomCurve3 }) {
  const { gl, scene } = useThree();
  const shotTaken = useRef(-1);
  const pose = useMemo(() => {
    const vp = stops(curve).find((s) => s.kind === "viewpoint");
    if (!vp || !vp.view) return null;
    const eye = vp.at.clone().addScaledVector(vp.out, PLAZA.d + 0.15); eye.y += 0.32;
    return { eye, view: vp.view.clone() };
  }, [curve]);
  const tmp = useMemo(() => ({ q: new Quaternion(), look: new Vector3(), from: new Vector3(), fromQ: new Quaternion(), cut: -1 }), []);

  useFrame(({ camera }) => {
    if (!pose) return;
    let t = vistaTime();
    if (t < 0) return;
    // the throttle brings it back early
    if (game.input.throttle > 0 && t < VISTA.in + VISTA.hold) { vista.t0 = performance.now() - (VISTA.in + VISTA.hold) * 1000; t = VISTA.in + VISTA.hold; }
    const total = vistaLength();
    const k = t < VISTA.in ? ease(t / VISTA.in) : t < VISTA.in + VISTA.hold ? 1 : ease((total - t) / VISTA.out);
    // looking out and down the valley, panning slowly from one side to the other
    const pan = (Math.min(1, Math.max(0, (t - VISTA.in * 0.5) / (VISTA.hold + VISTA.in))) - 0.5) * 0.7;
    const c = Math.cos(pan), s = Math.sin(pan), dir = new Vector3(pose.view.x * c - pose.view.z * s, 0, pose.view.x * s + pose.view.z * c);
    tmp.look.copy(pose.eye).addScaledVector(dir, 10); tmp.look.y -= 2.4;
    tmp.from.copy(camera.position); tmp.fromQ.copy(camera.quaternion);
    camera.position.copy(pose.eye); camera.lookAt(tmp.look); tmp.q.copy(camera.quaternion);
    camera.position.lerpVectors(tmp.from, pose.eye, k); camera.quaternion.slerpQuaternions(tmp.fromQ, tmp.q, k);
    const cam = camera as PerspectiveCamera;
    if (k > 0.99 && Math.abs(cam.fov - 62) > 0.5) { cam.fov = 62; cam.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    // the picture, once, in the middle of the view
    if (t >= VISTA.shootAt && shotTaken.current !== vista.run) {
      shotTaken.current = vista.run;
      gl.render(scene, camera);
      gl.domElement.toBlob((b) => { if (!b) return; vista.blob = b; shot.blob = b; shot.run = score.run; }, "image/jpeg", 0.92);
    }
    if (t > total - 0.05) vista.ended = performance.now();
  });
  return null;
}
