"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from "three";

function cloud(n: number, spread: number) {
  const g = new BufferGeometry(); const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = (Math.random() - 0.5) * spread; a[i * 3 + 1] = Math.random() * 20 + 2; a[i * 3 + 2] = (Math.random() - 0.5) * spread; }
  g.setAttribute("position", new BufferAttribute(a, 3));
  return g;
}

/** Mist (white, drifting) and fireflies (amber, bobbing). Opacity is driven by the director. */
export default function Particles({ mistRef, fliesRef, small }: { mistRef: React.MutableRefObject<Points | null>; fliesRef: React.MutableRefObject<Points | null>; small: boolean }) {
  const mistGeo = useMemo(() => cloud(small ? 300 : 700, 120), [small]);
  const flyGeo = useMemo(() => cloud(small ? 160 : 320, 60), [small]);
  const mistMat = useRef(new PointsMaterial({ size: 1.6, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  const flyMat = useRef(new PointsMaterial({ size: 0.35, color: 0xf2d27a, transparent: true, opacity: 0, depthWrite: false }));

  useFrame(({ camera, clock }, dt) => {
    const m = mistRef.current, f = fliesRef.current;
    if (m) { m.rotation.y += dt * 0.02; m.position.copy(camera.position); m.position.y -= 6; }
    if (f) {
      f.position.copy(camera.position); f.position.y -= 4;
      const p = f.geometry.attributes.position as BufferAttribute;
      for (let i = 0; i < p.count; i += 3) p.setY(i, p.getY(i) + Math.sin(clock.elapsedTime + i) * 0.01);
      p.needsUpdate = true;
    }
  });

  return (
    <>
      <points ref={mistRef} geometry={mistGeo} material={mistMat.current} />
      <points ref={fliesRef} geometry={flyGeo} material={flyMat.current} />
    </>
  );
}
