"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { loadRoad } from "@/lib/heightmap";
import { scrollState } from "@/lib/scrollState";
import { driveT } from "@/lib/drive";
import styles from "./MiniMap.module.scss";

const W = 120, PAD = 10;
type Drawn = { w: number; h: number; d: string; pts: [number, number][]; bends: [number, number][]; arch: [number, number] };

/** Real OSM road, north up, scaled into a W-wide box (longitude squeezed by cos(latitude) so the shape isn't stretched). */
function draw(points: [number, number][], bendIdx: number[], archIdx: number): Drawn {
  const lat0 = points[0][0], k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map(([, lon]) => lon * k), ys = points.map(([lat]) => -lat);
  const minX = Math.min(...xs), minY = Math.min(...ys), spanX = Math.max(...xs) - minX, spanY = Math.max(...ys) - minY;
  const scale = (W - 2 * PAD) / spanX, h = Math.round(spanY * scale + 2 * PAD);
  const pts = xs.map((x, i): [number, number] => [PAD + (x - minX) * scale, PAD + (ys[i] - minY) * scale]);
  const d = "M" + pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");
  return { w: W, h, d, pts, bends: bendIdx.map((i) => pts[i]), arch: pts[archIdx] };
}

/** The churam at a glance during Act 1: the real road, the nine hairpins, and where you are on it. */
export default function MiniMap() {
  const [map, setMap] = useState<Drawn | null>(null);
  const root = useRef<HTMLDivElement>(null), dot = useRef<SVGCircleElement>(null);

  useEffect(() => {
    loadRoad()
      .then((road) => setMap(draw(road.points, road.bends.map((b) => Math.round(b.along / road.step)), Math.round(road.arch.along / road.step))))
      .catch(() => {}); // no map without the road file; the counter still works
  }, []);

  useEffect(() => {
    if (!map) return;
    const tick = () => {
      const { act, progress } = scrollState;
      if (root.current) root.current.style.opacity = act === "churam" && progress < 0.97 ? "1" : "0";
      // t on the road ≈ distance fraction (the points are evenly spaced), at the same pace as the camera and counter
      const t = driveT(progress);
      const [x, y] = map.pts[Math.min(map.pts.length - 1, Math.round(t * (map.pts.length - 1)))];
      dot.current?.setAttribute("cx", x.toFixed(1));
      dot.current?.setAttribute("cy", y.toFixed(1));
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [map]);

  if (!map) return null;
  return (
    <div ref={root} className={styles.map} aria-hidden>
      <svg width={map.w} height={map.h} viewBox={`0 0 ${map.w} ${map.h}`}>
        <path d={map.d} className={styles.road} />
        {map.bends.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={5.5} className={styles.bend} />
            <text x={x} y={y + 0.5} className={styles.num}>{i + 1}</text>
          </g>
        ))}
        <rect x={map.arch[0] - 3} y={map.arch[1] - 3} width={6} height={6} className={styles.arch} />
        <circle ref={dot} r={3.5} className={styles.dot} cx={map.pts[0][0]} cy={map.pts[0][1]} />
      </svg>
      <div className={styles.labels}><span>Adivaram</span><span>Lakkidi ▪</span></div>
    </div>
  );
}
