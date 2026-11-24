"use client";
import { useEffect, useRef } from "react";
import { CAR, NITRO, game } from "@/lib/game";
import styles from "./Gauge.module.scss";

/**
 * The dial (desktop; phones keep the compact readout in DriveHud): a rev counter round the edge, 0–8 thousand with the
 * red line at 7, its needle and the lit arc behind it; the speed big in the middle, the gear under it; and outside, on
 * the left, the nitro tank. The revs and gears are the dial's own story told from the speed (five gears across the
 * car's top speed with nitro; revs climb through each and drop at the change), not the physics: the car has no gearbox.
 * Updated straight on the DOM each frame, never React state.
 */
const GEARS = 5, START = -135, SWEEP = 270, R = 84, C = 100; // the rev scale: from lower left, clockwise round to lower right
const MAX_RPM = 8, RED = 7;

// rounded: the server's and the browser's Math.cos can differ in the last digit, which React flags as a hydration mismatch
const round = (v: number) => Math.round(v * 100) / 100;
const polar = (deg: number, r: number) => { const a = ((deg - 90) * Math.PI) / 180; return [round(C + r * Math.cos(a)), round(C + r * Math.sin(a))] as const; };
const arc = (a0: number, a1: number, r: number) => {
  const [x0, y0] = polar(a0, r), [x1, y1] = polar(a1, r);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
const at = (rpm: number) => START + (SWEEP * rpm) / MAX_RPM;
const REV_LEN = (2 * Math.PI * R * SWEEP) / 360;
const NITRO_ARC = { a0: -150, a1: -40, r: 97 }; // outside the scale, on the left
const NITRO_LEN = (2 * Math.PI * NITRO_ARC.r * (NITRO_ARC.a1 - NITRO_ARC.a0)) / 360;

export default function Gauge() {
  const needle = useRef<SVGGElement>(null), lit = useRef<SVGPathElement>(null), tank = useRef<SVGPathElement>(null);
  const speed = useRef<HTMLElement>(null), gear = useRef<HTMLElement>(null), box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0, rpm = 0.9, shown = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const v = Math.abs(game.speed), top = CAR.max * NITRO.top, band = top / GEARS;
      const g = Math.min(GEARS - 1, Math.floor(v / band)), f = Math.min(1, (v - g * band) / band);
      // revs: from idle through first, then from ~3.4 thousand up to the red line in each gear above
      const want = !game.started ? 0.9 : v < 0.02 ? 0.9 + game.input.throttle * 2.5 : (g === 0 ? 1.1 + 5.6 * f : 3.4 + 3.7 * Math.pow(f, 0.9)) + game.input.throttle * 0.35 + (game.boosting ? 0.4 : 0);
      rpm += (Math.min(MAX_RPM - 0.05, want) - rpm) * 0.18;
      needle.current?.setAttribute("transform", `rotate(${at(rpm).toFixed(1)} ${C} ${C})`);
      lit.current?.setAttribute("stroke-dashoffset", String(REV_LEN * (1 - rpm / MAX_RPM)));
      tank.current?.setAttribute("stroke-dashoffset", String(NITRO_LEN * (1 - Math.max(0, Math.min(1, game.nitro)))));
      if (speed.current) speed.current.textContent = String(Math.round(v * 36));
      const label = !game.started ? "N" : game.speed < -0.02 ? "R" : String(g + 1);
      if (gear.current && label !== shown) { gear.current.textContent = label; shown = label; }
      box.current?.toggleAttribute("data-red", rpm > RED);
      box.current?.toggleAttribute("data-boost", game.boosting);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  const ticks = [];
  for (let k = 0; k <= MAX_RPM * 4; k++) {
    const rpm = k / 4, major = k % 4 === 0, [x0, y0] = polar(at(rpm), R - (major ? 11 : 6)), [x1, y1] = polar(at(rpm), R);
    ticks.push(<line key={k} x1={x0} y1={y0} x2={x1} y2={y1} data-major={major || undefined} data-red={rpm >= RED || undefined} />);
  }
  const numbers = Array.from({ length: MAX_RPM + 1 }, (_, i) => { const [x, y] = polar(at(i), R - 22); return <text key={i} x={x} y={y} data-red={i >= RED || undefined}>{i}</text>; });

  return (
    <div ref={box} className={styles.gauge} aria-hidden>
      <svg viewBox="0 0 200 200">
        <circle className={styles.face} cx={C} cy={C} r={R + 6} />
        <path className={styles.track} d={arc(START, START + SWEEP, R)} />
        <path ref={lit} className={styles.lit} d={arc(START, START + SWEEP, R)} strokeDasharray={REV_LEN} strokeDashoffset={REV_LEN} />
        <path className={styles.redline} d={arc(at(RED), START + SWEEP, R + 3)} />
        <g className={styles.ticks}>{ticks}</g>
        <g className={styles.numbers}>{numbers}</g>
        <path className={styles.tankTrack} d={arc(NITRO_ARC.a0, NITRO_ARC.a1, NITRO_ARC.r)} />
        <path ref={tank} className={styles.tank} d={arc(NITRO_ARC.a0, NITRO_ARC.a1, NITRO_ARC.r)} strokeDasharray={NITRO_LEN} strokeDashoffset={NITRO_LEN} />
        <g ref={needle} className={styles.needle}><line x1={C} y1={C - R + 4} x2={C} y2={C - R + 26} /></g>
        <text className={styles.rpmLabel} x={C} y={C + 74}>RPM ×1000</text>
      </svg>
      <div className={styles.read}>
        <b ref={speed}>0</b>
        <small>km/h</small>
        <em ref={gear}>N</em>
        <span>Auto</span>
      </div>
    </div>
  );
}
