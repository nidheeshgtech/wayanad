"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadRoad } from "@/lib/heightmap";
import { game, togglePause } from "@/lib/game";
import { JOBS } from "@/data/jobs";
import { jobs, wallet } from "@/lib/jobs";
import { CHECKPOSTS } from "@/lib/checkposts";
import styles from "./BigMap.module.scss";

/* The big map (M, or Map in the menu): the whole drive on the real road (OSM, as the radar has it), north up. The towns,
 * the nine hairpins, the chaya kadas and the viewpoint, the police speed checks, the Churam Jobs still open (and the
 * drop of the one you're on), and you. The drive holds still while it's open. */
type Road = { points: [number, number][]; step: number; bends?: { along: number }[]; arch?: { along: number }; places?: { name: string; along: number }[] };
const PAD = 54;

export default function BigMap({ onClose }: { onClose: () => void }) {
  const [road, setRoad] = useState<Road | null>(null);
  // a phone held sideways gets a wide map, a tall screen a tall one
  const [[W, H]] = useState<[number, number]>(() => (typeof window !== "undefined" && innerWidth > innerHeight * 1.15 ? [960, 520] : [600, 820]));
  const you = useRef<SVGGElement>(null), done = useRef<SVGPathElement>(null);
  useEffect(() => { loadRoad().then((r) => setRoad(r as Road)).catch(() => {}); }, []);
  useEffect(() => {
    const was = game.paused; if (!was) togglePause(true);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" || e.code === "KeyM") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); if (!was) togglePause(false); };
  }, [onClose]);

  const map = useMemo(() => {
    if (!road) return null;
    const lat0 = road.points[0][0], k = Math.cos((lat0 * Math.PI) / 180);
    const m = road.points.map(([lat, lon]) => [(lon - road.points[0][1]) * k * 111320, -(lat - lat0) * 110540] as [number, number]);
    const xs = m.map((p) => p[0]), ys = m.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sc = Math.min((W - 2 * PAD) / (x1 - x0), (H - 2 * PAD) / (y1 - y0));
    const ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
    const pts = m.map(([x, y]) => [ox + (x - x0) * sc, oy + (y - y0) * sc] as [number, number]);
    const d = "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");
    const n = pts.length;
    /** A road position (game units, 10 m) on the map. */
    const at = (s: number): [number, number] => {
      const f = Math.min(n - 1, Math.max(0, (s * 10) / road.step)), i = Math.floor(f), j = Math.min(n - 1, i + 1), t = f - i;
      return [pts[i][0] + (pts[j][0] - pts[i][0]) * t, pts[i][1] + (pts[j][1] - pts[i][1]) * t];
    };
    const places = [{ name: "Adivaram", along: 0 }, { name: "Lakkidi gate", along: road.arch?.along ?? 12150 }, ...(road.places ?? [])];
    return { d, at, n, step: road.step, places, bends: (road.bends ?? []).map((b) => at(b.along / 10)), total: ((n - 1) * road.step) / 10 };
  }, [road, W, H]);

  // you, live (the drive is paused, but you might have opened it while rolling to a stop)
  useEffect(() => {
    if (!map) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const [x, y] = map.at(game.s), [ax, ay] = map.at(game.s + 3 * Math.sign(game.speed || 1));
      const deg = (Math.atan2(ax - x, -(ay - y)) * 180) / Math.PI;
      you.current?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})`);
      done.current?.setAttribute("stroke-dasharray", `${Math.min(1, game.s / map.total).toFixed(4)} 2`);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [map]);

  const stops = (typeof window !== "undefined" ? (window as unknown as { __wayanadStops?: { kind: string; s: number }[] }).__wayanadStops : null) ?? [];
  const open = JOBS.filter((j) => !jobs.done.has(j.id) && jobs.active?.job.id !== j.id);
  const active = jobs.active;

  return (
    <div className={styles.veil} role="dialog" aria-modal aria-label="Map of the drive" onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <header>
          <div><p>Wayanad</p><h2>Adivaram → Kalpetta</h2></div>
          <b className={styles.wallet}><i>₹</i>{wallet().toLocaleString("en-IN")}</b>
          <button type="button" onClick={onClose} aria-label="Close the map">✕</button>
        </header>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg}>
          <defs>
            <pattern id="bigmap-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" className={styles.grid} /></pattern>
          </defs>
          <rect width={W} height={H} fill="url(#bigmap-grid)" />
          {map && (<>
            <path d={map.d} className={styles.casing} />
            <path d={map.d} className={styles.road} />
            <path ref={done} d={map.d} pathLength={1} className={styles.done} strokeDasharray="0 2" />
            {map.bends.map(([x, y], i) => <g key={"b" + i} transform={`translate(${x} ${y})`} className={styles.bend}><circle r={7} /><text y={0.5}>{i + 1}</text></g>)}
            {stops.map((st, i) => { const [x, y] = map.at(st.s); return <g key={"s" + i} transform={`translate(${x} ${y})`} className={styles.poi}><circle r={9} /><text y={1}>{st.kind === "viewpoint" ? "👁" : "☕"}</text></g>; })}
            {CHECKPOSTS.map((c) => { const [x, y] = map.at(c.s); return <g key={c.name} transform={`translate(${x} ${y})`} className={styles.police}><circle r={10} /><text y={1}>🚔</text></g>; })}
            {open.map((j) => { const [x, y] = map.at(j.pick); return <g key={j.id} transform={`translate(${x} ${y})`} className={styles.job} style={{ ["--t" as string]: j.tint }}><circle r={12} /><text y={0.5}>{j.initials}</text></g>; })}
            {active && (() => { const [x, y] = map.at(active.job.drop); return <g transform={`translate(${x} ${y})`} className={styles.drop}><circle r={13} /><text y={0.5}>{active.job.initials}</text></g>; })()}
            {map.places.map((p) => { const [x, y] = map.at(p.along / 10); return <g key={p.name} transform={`translate(${x} ${y})`} className={styles.place}><circle r={4.5} /><text x={12} y={4}>{p.name}</text></g>; })}
            <g ref={you} className={styles.you}><circle r={16} /><path d="M0 -11 L8 9 L0 4.5 L-8 9 Z" /></g>
          </>)}
          {!map && <text x={W / 2} y={H / 2} className={styles.loading}>Loading the map…</text>}
        </svg>
        <footer>
          <span><i className={styles.kYou} /> You</span>
          <span><i className={styles.kJob} /> Churam Jobs{active ? " · drop pulsing" : ""}</span>
          <span>🚔 Speed check · 60</span>
          <span>☕ Chaya</span>
          <span className={styles.keyHint}><kbd>M</kbd> close</span>
        </footer>
      </div>
    </div>
  );
}
