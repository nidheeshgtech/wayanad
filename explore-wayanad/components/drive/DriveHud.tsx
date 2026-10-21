"use client";
import { useEffect, useRef, useState } from "react";
import { game, resetCar, togglePause, VIEWS, type View } from "@/lib/game";
import { honk, horn } from "@/lib/horn";
import { engine } from "@/lib/engine";
import { quality, setQualityMode, type QualityMode } from "@/lib/quality";
import Sound from "@/components/ui/Sound";
import { loading, progress } from "@/lib/loading";
import styles from "./Drive.module.scss";

/**
 * Drive mode's controls and readouts. Keys: W/↑ accelerate, S/↓ brake (then reverse), A/D or ←/→ steer, Space (or
 * Esc) pause, H horn, C camera, R back on the road. Every on-screen button does the same as its key and lights up
 * when the key is used. Touch: big steer buttons bottom-left, horn bottom-centre, brake and accelerator bottom-right;
 * camera, reset, pause and sound small in the top-right corner. "Back to the story" shows for a few seconds after a tap.
 * Readouts are written straight into the DOM each frame (no React state per frame). React state only for the
 * screens: start, pause, the Kalpetta → Sulthan Bathery card, and the finish.
 */
const VIEW_NAME: Record<View, string> = { chase: "Behind", near: "Close", hood: "Bonnet" };
/** Line icons for the controls (24 px grid, stroked in the text colour). */
const ICON = {
  horn: <><path d="M3 10h3l11-5v14L6 14H3z" /><path d="m7 14 1.5 5H11l-1.2-4" /></>,
  view: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="m8 7 2-3h4l2 3" /><circle cx="12" cy="13.5" r="3.5" /></>,
  reset: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></>,
  pause: <path d="M8 5v14M16 5v14" />,
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
  go: <path d="m6 15 6-6 6 6" />,
  brake: <path d="m6 9 6 6 6-6" />,
};
const Icon = ({ name }: { name: keyof typeof ICON }) => <svg viewBox="0 0 24 24" aria-hidden>{ICON[name]}</svg>;
const QUALITY: QualityMode[] = ["auto", "high", "medium", "low"];

/** The next camera view; remembered for next time. */
function cycleView() {
  game.view = VIEWS[(VIEWS.indexOf(game.view) + 1) % VIEWS.length];
  try { localStorage.setItem("drive-view", game.view); } catch {}
}
/** Back to Adivaram: the whole drive from the start. */
function restart() {
  Object.assign(game, { leg: 0, phase: "drive", odometer: 0, clock: 0, paused: false });
  resetCar(3);
}

export default function DriveHud() {
  const [screen, setScreen] = useState<"start" | "drive" | "paused" | "between" | "finished">("start");
  const [ready, setReady] = useState(false), [view, setView] = useState<View>(game.view), [mode, setMode] = useState<QualityMode>(quality.mode);
  const speed = useRef<HTMLElement>(null), place = useRef<HTMLDivElement>(null), next = useRef<HTMLDivElement>(null), note = useRef<HTMLDivElement>(null);
  const summary = useRef({ km: 0, min: 0 }), bar = useRef<HTMLDivElement>(null), buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const flash = (name: string) => { const b = buttons.current[name]; if (!b) return; b.dataset.on = "1"; setTimeout(() => { delete b.dataset.on; }, 220); };

  // touch: the "Back to the story" link stays hidden until you tap the screen, then shows for a few seconds
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let timer = 0;
    const tap = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || (e.target as Element).closest("button")) return;
      top.current?.setAttribute("data-show", ""); clearTimeout(timer);
      timer = window.setTimeout(() => top.current?.removeAttribute("data-show"), 3000);
    };
    addEventListener("pointerdown", tap);
    return () => { removeEventListener("pointerdown", tap); clearTimeout(timer); };
  }, []);

  // the camera you used last time
  useEffect(() => { try { const v = localStorage.getItem("drive-view") as View | null; if (v && VIEWS.includes(v)) { game.view = v; setView(v); } } catch {} }, []);

  // keyboard
  useEffect(() => {
    const held = new Set<string>();
    const apply = () => {
      const has = (...k: string[]) => k.some((x) => held.has(x));
      if (game.paused) return;
      game.input.throttle = has("arrowup", "w") ? 1 : 0;
      game.input.brake = has("arrowdown", "s") ? 1 : 0;
      game.input.steer = (has("arrowleft", "a") ? 1 : 0) - (has("arrowright", "d") ? 1 : 0);
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault(); // the page never scrolls
      if (e.repeat) { held.add(k); apply(); return; }
      if (k === " " || k === "escape") { togglePause(); flash("pause"); }
      if (k === "h") { honk({ audible: true }); flash("horn"); }
      if (k === "c") { cycleView(); setView(game.view); flash("view"); }
      if (k === "r" && !game.paused) { resetCar(); flash("reset"); }
      held.add(k); apply();
    };
    const up = (e: KeyboardEvent) => { held.delete(e.key.toLowerCase()); apply(); };
    const blur = () => { held.clear(); apply(); };
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", blur);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", blur); };
  }, []);

  // readouts, engine note, and the screens the drive asks for
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (speed.current) speed.current.textContent = String(Math.round(Math.abs(game.speed) * 36));
      if (place.current) place.current.textContent = game.place;
      if (next.current) next.current.textContent = `${game.next} · ${game.nextM >= 1000 ? `${(game.nextM / 1000).toFixed(1)} km` : `${Math.round(game.nextM / 10) * 10} m`}`;
      if (bar.current) bar.current.style.transform = `scaleX(${progress()})`;
      if (loading.ready) setReady(true);
      if (note.current) note.current.textContent = game.scrape > 0.05 ? "Scraping the barrier" : game.bump > 0.25 ? "Bump" : "";
      engine(horn.sound && game.started && game.phase === "drive" && !game.paused, game.speed, game.input.throttle);
      const want = !game.started ? "start" : game.phase !== "drive" ? game.phase : game.paused ? "paused" : "drive";
      if (game.phase !== "drive") summary.current = { km: (game.odometer * 10) / 1000, min: game.clock / 60 };
      setScreen((s) => (s === want ? s : want));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); engine(false, 0, 0); };
  }, []);

  const start = () => { game.started = true; game.phase = "drive"; game.paused = false; };
  const onward = () => { game.leg = 1; game.phase = "drive"; resetCar(3); };
  const chooseQuality = (m: QualityMode) => { setQualityMode(m); setMode(m); };
  // touch: hold to press; leaving the button lets go
  const hold = (set: (on: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); set(true); },
    onPointerUp: () => set(false), onPointerCancel: () => set(false), onPointerLeave: () => set(false),
  });
  const ref = (name: string) => (el: HTMLButtonElement | null) => { buttons.current[name] = el; };

  return (
    <>
      <div ref={top} className={styles.top}>
        <a href="/" className={styles.back}>← Back to the story</a>
        <div className={styles.where}><div ref={place} className={styles.place}>Adivaram</div><div ref={next} className={styles.next} /></div>
        <div className={styles.speed}><b ref={speed}>0</b><small>km/h</small></div>
      </div>
      <div ref={note} className={styles.note} aria-live="polite" />

      <div className={styles.buttons}>
        <button type="button" ref={ref("horn")} className={styles.hornKey} onClick={() => { honk({ audible: true }); flash("horn"); }} title="Horn (H)" aria-label="Horn"><Icon name="horn" /></button>
        <button type="button" ref={ref("view")} onClick={() => { cycleView(); setView(game.view); flash("view"); }} title={`Camera: ${VIEW_NAME[view]} (C)`} aria-label={`Camera: ${VIEW_NAME[view]}`}><Icon name="view" /></button>
        <button type="button" ref={ref("reset")} onClick={() => { resetCar(); flash("reset"); }} title="Back on the road (R)" aria-label="Back on the road"><Icon name="reset" /></button>
        <button type="button" ref={ref("pause")} onClick={() => togglePause()} title="Pause (Space)" aria-label="Pause"><Icon name="pause" /></button>
        <Sound icon />
      </div>

      {/* touch controls (shown on touch screens) */}
      <div className={styles.touch}>
        <div className={styles.steer} aria-hidden>
          <button type="button" {...hold((on) => { if (!game.paused) game.input.steer = on ? 1 : 0; })}><Icon name="left" /></button>
          <button type="button" {...hold((on) => { if (!game.paused) game.input.steer = on ? -1 : 0; })}><Icon name="right" /></button>
        </div>
        <button type="button" className={styles.bigHorn} onClick={() => honk({ audible: true })} aria-label="Horn"><Icon name="horn" /></button>
        <div className={styles.pedals}>
          <button type="button" className={styles.brake} {...hold((on) => { if (!game.paused) game.input.brake = on ? 1 : 0; })}><Icon name="brake" /></button>
          <button type="button" className={styles.gas} {...hold((on) => { if (!game.paused) game.input.throttle = on ? 1 : 0; })}><Icon name="go" /></button>
        </div>
      </div>

      {screen === "start" && (
        <div className={styles.card} role="dialog" aria-label="Drive the churam">
          <h1>Drive the churam</h1>
          <p>From Adivaram: nine hairpins up to the Lakkidi gate, across the plateau to Kalpetta, then the forest road to the Karnataka border.</p>
          <ul className={styles.keys}>
            <li><kbd>W</kbd><kbd>↑</kbd> accelerate · <kbd>S</kbd><kbd>↓</kbd> brake, reverse</li>
            <li><kbd>A</kbd><kbd>D</kbd> or <kbd>←</kbd><kbd>→</kbd> steer</li>
            <li><kbd>H</kbd> horn: a slow vehicle ahead gives way where it&apos;s safe</li>
            <li><kbd>Space</kbd> pause · <kbd>C</kbd> camera · <kbd>R</kbd> back on the road</li>
          </ul>
          <p className={styles.phone}>On a phone: ◀ ▶ steer, ▲ go, ▼ brake, the middle button is the horn. Tap the screen for the way back to the story.</p>
          <p className={styles.small}>Keep left. Overtake on the right when the road is clear; oncoming traffic slows for you, but not on the hairpins. Showers come and go.</p>
          {ready ? <button type="button" className={styles.go} onClick={start} autoFocus>Start driving</button> : (
            <div className={styles.loading} aria-live="polite"><div className={styles.track}><div ref={bar} className={styles.bar} /></div><span>Loading the road…</span></div>
          )}
        </div>
      )}
      {screen === "paused" && (
        <div className={styles.card} role="dialog" aria-label="Paused">
          <h1>Paused</h1>
          <div className={styles.row}>
            <button type="button" className={styles.go} onClick={() => togglePause(false)} autoFocus>Resume</button>
            <button type="button" className={styles.ghostButton} onClick={restart}>Restart from Adivaram</button>
          </div>
          <div className={styles.setting} role="group" aria-label="Graphics">
            <span>Graphics</span>
            {QUALITY.map((q) => <button key={q} type="button" aria-pressed={mode === q} onClick={() => chooseQuality(q)}>{q[0].toUpperCase() + q.slice(1)}</button>)}
          </div>
          <a href="/" className={styles.ghost}>Back to the story</a>
        </div>
      )}
      {screen === "between" && (
        <div className={styles.card} role="dialog" aria-label="Kalpetta">
          <h1>Kalpetta</h1>
          <p>The road on to Sulthan Bathery (24 km) isn&apos;t built yet. The drive carries on from Sulthan Bathery, through the forest to the border.</p>
          <button type="button" className={styles.go} onClick={onward} autoFocus>Drive on from Sulthan Bathery</button>
        </div>
      )}
      {screen === "finished" && (
        <div className={styles.card} role="dialog" aria-label="The border">
          <h1>The border gate</h1>
          <p>Kerala ends at the barrier; Karnataka is on the other side. You drove {summary.current.km.toFixed(1)} km in {Math.max(1, Math.round(summary.current.min))} min.</p>
          <div className={styles.row}>
            <button type="button" className={styles.go} onClick={restart} autoFocus>Drive again</button>
            <a href="/" className={styles.ghost}>Back to the story</a>
          </div>
        </div>
      )}
    </>
  );
}
