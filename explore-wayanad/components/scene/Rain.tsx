"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from "three";

/* Light monsoon drizzle: short streaks falling in a box that travels with the camera (positions wrap inside it),
 * slanted a little by the wind. Faint on purpose: you notice it, it doesn't hide the road. Units of 10 m. */
const BOX = { x: 5, y: 3, z: 5 }, FALL = 0.9, WIND = 0.08, STREAK = 0.035;

export default function Rain({ count = 2500, opacity = 0.22 }: { count?: number; opacity?: number }) {
  const { lines, seeds } = useMemo(() => {
    const seeds = Float32Array.from({ length: count * 3 }, (_, i) => Math.random() * [BOX.x, BOX.y, BOX.z][i % 3] * 2);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(count * 6), 3));
    const lines = new LineSegments(geo, new LineBasicMaterial({ color: 0xc9d2d6, transparent: true, opacity, depthWrite: false }));
    lines.frustumCulled = false;
    lines.name = "rain";
    return { lines, seeds };
  }, [count, opacity]);

  useFrame(({ camera, clock }) => {
    const p = lines.geometry.attributes.position as BufferAttribute, a = p.array as Float32Array, t = clock.elapsedTime;
    const wrap = (v: number, size: number) => ((v % (size * 2)) + size * 2) % (size * 2) - size;
    for (let i = 0; i < count; i++) {
      const x = camera.position.x + wrap(seeds[i * 3] - camera.position.x + WIND * t, BOX.x);
      const y = camera.position.y + wrap(seeds[i * 3 + 1] - t * FALL, BOX.y);
      const z = camera.position.z + wrap(seeds[i * 3 + 2] - camera.position.z, BOX.z);
      a.set([x, y, z, x - WIND * STREAK, y - STREAK, z], i * 6);
    }
    p.needsUpdate = true;
  });
  return <primitive object={lines} />;
}
