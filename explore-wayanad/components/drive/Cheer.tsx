"use client";
import { useEffect, useRef, useState } from "react";
import { clock } from "@/lib/share";
import styles from "./Drive.module.scss";

/* The climb's finish at the Lakkidi gate, while the road stays open on to Kalpetta: two party poppers burst from the
 * screen's lower corners (confetti on a 2D canvas, a few seconds, nothing kept), a banner with the time and score, and
 * after a few seconds the banner shrinks to a strip at the top and goes, and you're simply driving on. No confetti
 * with reduced motion. */
export type CheerData = { sec: number; points: number; best: number; isNew: boolean; race: string; next: string; km: number };

const POP = { pieces: 90, life: 3.6, gravity: 900, drag: 0.985 };
const COLOURS = ["#D9A441", "#ffd983", "#EEF2EE", "#5fd38d", "#2f9e6a", "#ff7a9c", "#6cc4ff"];

export default function Cheer({ data, onDone }: { data: CheerData; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState<"big" | "small">("big");
  useEffect(() => {
    const a = setTimeout(() => setStage("small"), 4200), b = setTimeout(onDone, 11000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [onDone]);
  useEffect(() => {
    const c = canvas.current, ctx = c?.getContext("2d");
    if (!c || !ctx || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr; ctx.scale(dpr, dpr);
    // two poppers: from the lower left and right corners, up and in toward the middle
    const bits = [-1, 1].flatMap((side) => Array.from({ length: POP.pieces }, () => {
      const lean = 0.3 + Math.random() * 0.5, v = (0.9 + Math.random() * 0.7) * Math.min(H, 900) * 1.35; // radians off upright, toward the middle
      return { x: side < 0 ? 0 : W, y: H * 0.92, vx: -side * Math.sin(lean) * v, vy: -Math.cos(lean) * v, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 14,
        w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, col: COLOURS[(Math.random() * COLOURS.length) | 0], wob: Math.random() * 6 };
    }));
    let raf = 0, last = performance.now(); const t0 = last;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000), age = (now - t0) / 1000; last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, Math.min(1, (POP.life - age) / 0.8));
      for (const p of bits) {
        p.vx *= POP.drag; p.vy = p.vy * POP.drag + POP.gravity * dt; p.x += p.vx * dt + Math.sin(age * 6 + p.wob) * 0.6; p.y += p.vy * dt; p.r += p.vr * dt;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.r * 1.7)); ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      if (age < POP.life) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <canvas ref={canvas} className={styles.confetti} aria-hidden />
      <div className={styles.cheer} data-stage={stage} role="status" aria-live="polite">
        <p>Lakkidi gate · climb done 🎉</p>
        <b>Welcome to Wayanad!</b>
        <div className={styles.cheerRow}>
          <span><small>Time</small>{clock(data.sec)}</span>
          <span><small>Score</small>{data.points.toLocaleString("en-IN")}</span>
          <span><small>{data.isNew ? "New best!" : "Best"}</small>{data.isNew ? "🏆" : Number.isFinite(data.best) && data.best > 0 ? clock(data.best) : "—"}</span>
        </div>
        {data.race && <em>You reached the gate {data.race}</em>}
        <i>Road open → {data.next} · Kalpetta {data.km.toFixed(0)} km. Keep driving!</i>
      </div>
    </>
  );
}
