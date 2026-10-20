"use client";
import { useEffect, useRef, useState } from "react";
import { game, resetBus } from "@/lib/game";
import { honk, horn } from "@/lib/horn";
import { engine } from "@/lib/engine";
import Sound from "@/components/ui/Sound";
import styles from "./Drive.module.scss";

/**
 * Drive mode's controls and readouts. Keys: ↑/W accelerate, ↓/S or Space brake (and reverse), ←/→ or A/D steer,
 * H horn, R back on the road, C driver's seat / outside. Touch: steer buttons on the left, brake and accelerator on the right.
 * Readouts are written straight into the DOM each frame (no React state per frame). React state only for the
 * screens: start, the Kalpetta → Sulthan Bathery card, and the finish.
 */
/** Outside (behind the bus) or the driver's seat; remembered for next time. */
function toggleView() {
  game.view = game.view === "cab" ? "chase" : "cab";
  try { localStorage.setItem("drive-view", game.view); } catch {}
}

export default function DriveHud() {
  const [screen, setScreen] = useState<"start" | "drive" | "between" | "finished">("start");
  const speed = useRef<HTMLElement>(null), place = useRef<HTMLDivElement>(null), next = useRef<HTMLDivElement>(null), note = useRef<HTMLDivElement>(null);
  const summary = useRef({ km: 0, min: 0 });

  // the view you used last time
  useEffect(() => { try { const v = localStorage.getItem("drive-view"); if (v === "cab" || v === "chase") game.view = v; } catch {} }, []);

  // keyboard
  useEffect(() => {
    const held = new Set<string>();
    const apply = () => {
      const has = (...k: string[]) => k.some((x) => held.has(x));
      game.input.throttle = has("arrowup", "w") ? 1 : 0;
      game.input.brake = has("arrowdown", "s", " ") ? 1 : 0;
      game.input.steer = (has("arrowleft", "a") ? 1 : 0) - (has("arrowright", "d") ? 1 : 0);
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (k === "h" && !e.repeat) honk();
      if (k === "r" && !e.repeat) resetBus();
      if ((k === "c" || k === "v") && !e.repeat) toggleView();
      held.add(k); apply();
    };
    const up = (e: KeyboardEvent) => { held.delete(e.key.toLowerCase()); apply(); };
    const blur = () => { held.clear(); apply(); };
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", blur);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", blur); };
  }, []);

  // readouts, engine note, and the screens the bus asks for
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (speed.current) speed.current.textContent = String(Math.round(Math.abs(game.speed) * 36));
      if (place.current) place.current.textContent = game.place;
      if (next.current) next.current.textContent = `${game.next} · ${game.nextM >= 1000 ? `${(game.nextM / 1000).toFixed(1)} km` : `${Math.round(game.nextM / 10) * 10} m`}`;
      if (note.current) note.current.textContent = game.scrape > 0.05 ? "Scraping the barrier" : game.bump > 0.2 ? "Bump" : "";
      engine(horn.sound && game.started && game.phase === "drive", game.speed, game.input.throttle);
      if (game.phase !== "drive") {
        summary.current = { km: (game.odometer * 10) / 1000, min: game.clock / 60 };
        setScreen((s) => (s === game.phase ? s : game.phase));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); engine(false, 0, 0); };
  }, []);

  const start = () => { game.started = true; game.phase = "drive"; setScreen("drive"); };
  const onward = () => { game.leg = 1; game.phase = "drive"; resetBus(3); setScreen("drive"); };
  // touch: hold to press; leaving the button lets go
  const hold = (set: (on: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); set(true); },
    onPointerUp: () => set(false), onPointerCancel: () => set(false), onPointerLeave: () => set(false),
  });

  return (
    <>
      <div className={styles.top}>
        <a href="/" className={styles.back}>← Back to the story</a>
        <div className={styles.where}><div ref={place} className={styles.place}>Adivaram</div><div ref={next} className={styles.next} /></div>
        <div className={styles.speed}><b ref={speed}>0</b><small>km/h</small></div>
      </div>
      <div ref={note} className={styles.note} aria-live="polite" />

      <div className={styles.buttons}>
        <button type="button" onClick={() => honk()} title="Horn (H)">Horn</button>
        <button type="button" onClick={() => resetBus()} title="Back on the road (R)">Reset</button>
        <button type="button" onClick={toggleView} title="Driver's seat or behind the bus (C)">View</button>
      </div>
      <Sound />

      {/* touch controls (shown on touch screens) */}
      <div className={styles.touch} aria-hidden>
        <div className={styles.steer}>
          <button type="button" {...hold((on) => { game.input.steer = on ? 1 : 0; })}>◀</button>
          <button type="button" {...hold((on) => { game.input.steer = on ? -1 : 0; })}>▶</button>
        </div>
        <div className={styles.pedals}>
          <button type="button" className={styles.brake} {...hold((on) => { game.input.brake = on ? 1 : 0; })}>Brake</button>
          <button type="button" className={styles.gas} {...hold((on) => { game.input.throttle = on ? 1 : 0; })}>Go</button>
        </div>
      </div>

      {screen === "start" && (
        <div className={styles.card} role="dialog" aria-label="Drive the churam">
          <h1>Drive the churam</h1>
          <p>A Kerala state bus from Adivaram: nine hairpins up to the Lakkidi gate, across the plateau to Kalpetta, then the forest road to the Karnataka border.</p>
          <ul className={styles.keys}>
            <li><kbd>↑</kbd><kbd>W</kbd> accelerate</li>
            <li><kbd>↓</kbd><kbd>S</kbd> brake, reverse</li>
            <li><kbd>←</kbd><kbd>→</kbd> steer</li>
            <li><kbd>H</kbd> horn: a slow vehicle ahead gives way where it&apos;s safe</li>
            <li><kbd>R</kbd> back on the road</li>
            <li><kbd>C</kbd> driver&apos;s seat or behind the bus</li>
          </ul>
          <p className={styles.small}>Keep left. Overtake on the right when the road is clear; oncoming traffic slows for you, but not on the hairpins. Showers come and go.</p>
          <button type="button" className={styles.go} onClick={start}>Start the bus</button>
        </div>
      )}
      {screen === "between" && (
        <div className={styles.card} role="dialog" aria-label="Kalpetta">
          <h1>Kalpetta</h1>
          <p>The road on to Sulthan Bathery (24 km) isn&apos;t built yet. The drive carries on from Sulthan Bathery, through the forest to the border.</p>
          <button type="button" className={styles.go} onClick={onward}>Drive on from Sulthan Bathery</button>
        </div>
      )}
      {screen === "finished" && (
        <div className={styles.card} role="dialog" aria-label="The border">
          <h1>The border gate</h1>
          <p>Kerala ends at the barrier; Karnataka is on the other side. You drove {summary.current.km.toFixed(1)} km in {Math.max(1, Math.round(summary.current.min))} min.</p>
          <div className={styles.row}>
            <button type="button" className={styles.go} onClick={() => location.reload()}>Drive again</button>
            <a href="/" className={styles.ghost}>Back to the story</a>
          </div>
        </div>
      )}
    </>
  );
}
