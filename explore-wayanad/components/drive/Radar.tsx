"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { loadRoad } from "@/lib/heightmap";
import { scrollState } from "@/lib/scrollState";
import { game } from "@/lib/game";
import { score } from "@/lib/score";
import { net, remoteState, type Snap } from "@/lib/net";
import styles from "./Radar.module.scss";

/* The drive's minimap as a game radar: a round window on the real road (OSM, components/ui/MiniMap's data) centred on
 * your car and turning with the road, so the way ahead is always up. On it, as icons that stay upright: the hairpins
 * (numbered, faded once passed), the tea stall, the Lakkidi gate and the other drivers in your room; the gate and the
 * drivers stay pinned to the rim, pointing the way, when they're off the map. The rim fills as you climb and carries a
 * compass N and the km. Everything moves by setting attributes in a ticker (no React state per frame).
 * SVG units: the radar is 200 across (−100…100); the map inside a circle of R, at SCALE units a metre. */
const R = 84, RING = 92, SCALE = R / 650; // 650 m from the car to the edge
const OTHERS = 12;
const TURN = 6; // how fast the map turns to the road's heading (1/s): smooth through the hairpins

type Map = {
  pts: [number, number][];  // metres: x east, y south
  step: number;             // metres between points (the game road's units are 10 m, from the same start)
  d: string; grid: string;
  bends: [number, number][]; arch: [number, number];
};

function build(points: [number, number][], step: number, bendIdx: number[], archIdx: number): Map {
  const lat0 = points[0][0], k = Math.cos((lat0 * Math.PI) / 180);
  const pts = points.map(([lat, lon]): [number, number] => [(lon - points[0][1]) * k * 111320, -(lat - lat0) * 110540]);
  const d = "M" + pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1).map(([x, y]) => `${x.toFixed(0)} ${y.toFixed(0)}`).join("L");
  // a grid every 250 m over the road's extent (and a margin), for a sense of movement
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), G = 250, M = 1000;
  const x0 = Math.floor((Math.min(...xs) - M) / G) * G, x1 = Math.max(...xs) + M, y0 = Math.floor((Math.min(...ys) - M) / G) * G, y1 = Math.max(...ys) + M;
  let grid = "";
  for (let x = x0; x <= x1; x += G) grid += `M${x} ${y0}V${y1.toFixed(0)}`;
  for (let y = y0; y <= y1; y += G) grid += `M${x0} ${y}H${x1.toFixed(0)}`;
  return { pts, step, d, grid, bends: bendIdx.map((i) => pts[Math.min(pts.length - 1, i)]), arch: pts[Math.min(pts.length - 1, archIdx)] };
}

export default function Radar() {
  const [map, setMap] = useState<Map | null>(null);
  const root = useRef<HTMLDivElement>(null), world = useRef<SVGGElement>(null), done = useRef<SVGPathElement>(null);
  const ring = useRef<SVGCircleElement>(null), north = useRef<SVGGElement>(null), km = useRef<SVGTextElement>(null);
  const bends = useRef<SVGGElement>(null), stall = useRef<SVGGElement>(null), gate = useRef<SVGGElement>(null), others = useRef<SVGGElement>(null);

  useEffect(() => {
    loadRoad()
      .then((road) => setMap(build(road.points, road.step, (road.bends ?? []).map((b) => Math.round(b.along / road.step)), Math.round((road.arch?.along ?? 0) / road.step))))
      .catch(() => {}); // no radar without the road file
  }, []);

  useEffect(() => {
    if (!map) return;
    const n = map.pts.length, snap = {} as Snap;
    let heading = NaN, last = performance.now(), shown = false;
    /** A point on the road `s` game units (10 m) from Adivaram, between the points. */
    const at = (s: number): [number, number] => {
      const f = Math.min(n - 1, Math.max(0, (s * 10) / map.step)), i = Math.floor(f), j = Math.min(n - 1, i + 1), k = f - i;
      return [map.pts[i][0] + (map.pts[j][0] - map.pts[i][0]) * k, map.pts[i][1] + (map.pts[j][1] - map.pts[i][1]) * k];
    };
    const tick = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      const visible = game.leg === 0 && scrollState.act === "churam" && scrollState.progress < 0.97 && game.roadLength > 0;
      if (visible !== shown && root.current) { shown = visible; root.current.toggleAttribute("data-on", visible); }
      if (!visible) return;
      const [cx, cy] = at(game.s);
      // the road's direction here (a few points either side, so a hairpin turns the map rather than flicking it)
      const f = (game.s * 10) / map.step, a0 = map.pts[Math.max(0, Math.floor(f) - 3)], a1 = map.pts[Math.min(n - 1, Math.floor(f) + 4)];
      const want = Math.atan2(a1[0] - a0[0], -(a1[1] - a0[1]));
      if (Number.isNaN(heading)) heading = want;
      let diff = want - heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      heading += diff * Math.min(1, dt * TURN);
      const sin = Math.sin(heading), cos = Math.cos(heading), deg = (-heading * 180) / Math.PI;
      world.current?.setAttribute("transform", `rotate(${deg.toFixed(2)}) scale(${SCALE}) translate(${(-cx).toFixed(1)} ${(-cy).toFixed(1)})`);
      done.current?.setAttribute("stroke-dasharray", `${Math.max(0, Math.min(1, f / (n - 1))).toFixed(4)} 2`);
      // map metres → radar units, turned with the map; `pin`: keep it on the rim when it's off the map
      const place = (el: Element | undefined | null, x: number, y: number, pin: boolean) => {
        if (!el) return;
        const dx = (x - cx) * SCALE, dy = (y - cy) * SCALE;
        let px = dx * cos + dy * sin, py = -dx * sin + dy * cos;
        const r = Math.hypot(px, py), edge = R - 9, out = r > edge;
        if (out && !pin) { el.setAttribute("visibility", "hidden"); return; }
        if (out) { px *= edge / r; py *= edge / r; }
        el.setAttribute("visibility", "visible");
        el.setAttribute("transform", `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
        el.toggleAttribute("data-edge", out);
      };
      const bs = bends.current?.children;
      if (bs) for (let i = 0; i < bs.length; i++) { place(bs[i], map.bends[i][0], map.bends[i][1], false); bs[i].toggleAttribute("data-passed", i < game.bends); }
      const teaDone = game.teaRun === score.run || game.stall <= 0;
      if (teaDone) stall.current?.setAttribute("visibility", "hidden");
      else { const [sx, sy] = at(game.stall); place(stall.current, sx, sy, false); }
      place(gate.current, map.arch[0], map.arch[1], true);
      // the others in your room, pinned to the rim when they're far up or down the road
      const os = others.current?.children;
      if (os) {
        let i = 0;
        if (net.enabled) for (const r of net.remotes.values()) {
          if (i >= os.length) break;
          const st = remoteState(r, now, snap);
          if (!st) continue;
          const [ox, oy] = at(st.s), g = os[i++];
          place(g, ox, oy, true);
          const letter = (r.name.trim()[0] ?? "?").toUpperCase(), tx = g.lastElementChild;
          if (tx && tx.textContent !== letter) tx.textContent = letter;
        }
        for (; i < os.length; i++) os[i].setAttribute("visibility", "hidden");
      }
      // the rim: how far up you are, the compass, the km
      ring.current?.setAttribute("stroke-dasharray", `${Math.min(1, game.kmTotal ? game.km / game.kmTotal : 0).toFixed(4)} 2`);
      north.current?.setAttribute("transform", `translate(${(-RING * sin).toFixed(1)} ${(-RING * cos).toFixed(1)})`);
      if (km.current) { const text = `${game.km.toFixed(1)} KM`; if (km.current.textContent !== text) km.current.textContent = text; }
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [map]);

  if (!map) return null;
  return (
    <div ref={root} className={styles.radar} aria-hidden data-hud>
      <svg viewBox="-100 -100 200 200">
        <defs>
          <clipPath id="radar-clip"><circle r={R} /></clipPath>
          <radialGradient id="radar-ground"><stop offset="0" stopColor="#21463a" /><stop offset="1" stopColor="#0c1f19" /></radialGradient>
          <radialGradient id="radar-shade"><stop offset=".72" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" /></radialGradient>
          <linearGradient id="radar-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b4f48" /><stop offset="1" stopColor="#121e1a" /></linearGradient>
        </defs>
        {/* the rim: a bezel, the climb so far, the track it fills */}
        <circle r={99} fill="url(#radar-rim)" className={styles.bezel} />
        <circle r={RING} className={styles.track} />
        <circle ref={ring} r={RING} pathLength={1} transform="rotate(-90)" className={styles.fill} strokeDasharray="0 2" />
        <g clipPath="url(#radar-clip)">
          <circle r={R} fill="url(#radar-ground)" />
          <g ref={world}>
            <path d={map.grid} className={styles.grid} />
            <path d={map.d} className={styles.casing} />
            <path d={map.d} className={styles.road} />
            <path ref={done} d={map.d} pathLength={1} className={styles.done} strokeDasharray="0 2" />
          </g>
          <g ref={bends}>
            {map.bends.map((_, i) => <g key={i} className={styles.bend} visibility="hidden"><circle r={6.5} /><text y={0.4}>{i + 1}</text></g>)}
          </g>
          <g ref={stall} className={styles.stall} visibility="hidden">
            <circle r={7.5} />
            <path d="M-3.6 -2.2h6l-.7 5.4h-4.6z M2.4 -1.2h1.3a1.4 1.4 0 0 1 0 2.8h-1.6" />
          </g>
          <circle r={R} fill="url(#radar-shade)" pointerEvents="none" />
        </g>
        {/* drawn over the shade: they matter most */}
        <g ref={others}>
          {Array.from({ length: OTHERS }, (_, i) => <g key={i} className={styles.other} visibility="hidden"><circle r={6} /><text y={0.4} /></g>)}
        </g>
        <g ref={gate} className={styles.gate} visibility="hidden">
          <circle r={8.5} />
          <g transform="translate(-4.5 -3.4)">
            <rect width={9} height={6.8} className={styles.flagWhite} />
            <path d="M0 0h2.25v1.7H0zM4.5 0h2.25v1.7H4.5zM2.25 1.7H4.5v1.7H2.25zM6.75 1.7H9v1.7H6.75zM0 3.4h2.25v1.7H0zM4.5 3.4h2.25v1.7H4.5zM2.25 5.1H4.5v1.7H2.25zM6.75 5.1H9v1.7H6.75z" className={styles.flagDark} />
          </g>
        </g>
        {/* you: the arrow, always pointing up the road */}
        <g className={styles.car}>
          <circle r={13} className={styles.carGlow} />
          <path d="M0 -10 L7.5 8 L0 4 L-7.5 8 Z" />
        </g>
        {/* on the rim: which way is north, and how far you've come */}
        <path d="M0 -99 l5 -1 -5 8 -5 -8z" className={styles.notch} />
        <g transform={`translate(0 ${RING})`} className={styles.km}><rect x={-20} y={-7.5} width={40} height={15} rx={7.5} /><text ref={km} y={0.5}>0.0 KM</text></g>
        <g ref={north} className={styles.north} transform={`translate(0 ${-RING})`}><circle r={6.5} /><text y={0.4}>N</text></g>
      </svg>
    </div>
  );
}
