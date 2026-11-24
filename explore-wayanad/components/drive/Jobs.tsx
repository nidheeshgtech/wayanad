"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, CanvasTexture, CatmullRomCurve3, CircleGeometry, Color, CylinderGeometry, Group, Mesh,
  MeshBasicMaterial, RingGeometry, Vector3,
} from "three";
import { JOBS } from "@/data/jobs";
import { jobs, jobsOn, markers, stepJobs } from "@/lib/jobs";

/* Churam Jobs in the scene (lib/jobs): steps the jobs each frame and draws their circles on the road, an amber ring with
 * a soft column of light over your lane: every open pickup, or, on a job, its drop (pulsing). Units of 10 m. */
const LAT = 0.2, ROAD_DROP = 0.588; // your lane; the curve runs this far above the road surface (PlayerCar)

/** A vertical fade, bright at the foot, gone at the top: the column's texture. */
function fade() {
  const c = document.createElement("canvas"); c.width = 4; c.height = 128;
  const ctx = c.getContext("2d")!, g = ctx.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.25, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 128);
  return new CanvasTexture(c);
}

export default function Jobs({ curve }: { curve: CatmullRomCurve3 }) {
  const { root, spots } = useMemo(() => {
    const root = new Group(); root.name = "jobs";
    const L = curve.getLength(), tex = fade();
    const ringGeo = new RingGeometry(0.42, 0.5, 64).rotateX(-Math.PI / 2);
    const discGeo = new CircleGeometry(0.42, 64).rotateX(-Math.PI / 2);
    const colGeo = new CylinderGeometry(0.47, 0.47, 1.0, 48, 1, true).translate(0, 0.45, 0);
    const make = (s: number) => {
      const t = Math.min(1, Math.max(0, s / L)), p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const left = new Vector3(tan.z, 0, -tan.x).normalize();
      const g = new Group();
      g.position.copy(p).addScaledVector(left, LAT); g.position.y -= ROAD_DROP - 0.015;
      const color = new Color(0xd9a441);
      const ring = new MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
      const disc = new MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
      const col = new MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending });
      g.add(new Mesh(ringGeo, ring), new Mesh(discGeo, disc), new Mesh(colGeo, col));
      g.children.forEach((m) => { m.renderOrder = 2; m.frustumCulled = false; });
      g.visible = false; root.add(g);
      return { g, ring, disc, col };
    };
    const spots = new Map<number, ReturnType<typeof make>>();
    for (const j of JOBS) for (const s of [j.pick, j.drop]) if (!spots.has(s)) spots.set(s, make(s));
    return { root, spots };
  }, [curve]);

  useFrame((state, dt) => {
    stepJobs(dt);
    const on = jobsOn(), list = on ? markers() : [], t = state.clock.elapsedTime;
    for (const sp of spots.values()) sp.g.visible = false;
    for (const m of list) {
      const sp = spots.get(m.s);
      if (!sp) continue;
      sp.g.visible = true;
      // a drop pulses; a pickup breathes slowly; the circle you're stopping in fills
      const beat = m.drop ? 0.5 + 0.5 * Math.sin(t * 5) : 0.5 + 0.5 * Math.sin(t * 1.6);
      const filling = (jobs.active ? jobs.active.job.drop === m.s : jobs.near?.pick === m.s) ? Math.min(1, jobs.wait) : 0;
      sp.ring.opacity = 0.7 + 0.3 * beat;
      sp.disc.opacity = 0.12 + 0.1 * beat + 0.5 * filling;
      sp.col.opacity = 0.18 + 0.14 * beat;
      sp.g.scale.setScalar(1 + (m.drop ? 0.06 * beat : 0));
    }
  });
  return <primitive object={root} />;
}
