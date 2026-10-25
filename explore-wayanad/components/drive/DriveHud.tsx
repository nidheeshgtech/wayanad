"use client";
import { useEffect, useRef, useState } from "react";
import { game, resetCar, togglePause, VIEWS, type View } from "@/lib/game";
import { honk, horn } from "@/lib/horn";
import { engine } from "@/lib/engine";
import { quality, setQualityMode, type QualityMode } from "@/lib/quality";
import Sound from "@/components/ui/Sound";
import ThemeToggle from "@/components/ui/ThemeToggle";
import StartScreen, { ControlRow, panelStyles } from "@/components/ui/StartScreen";
import { clock, recordClimb, shareClimb } from "@/lib/share";
import { PRESENTED_BY, STAY, linkedSponsors } from "@/data/sponsors";
import { WHATSAPP } from "@/data/plan";
import { joinRoom, net } from "@/lib/net";
import { cleanName } from "@/lib/names";
import styles from "./Drive.module.scss";

/**
 * Drive mode's controls and readouts. Keys: W/↑ accelerate, S/↓ brake (then reverse), A/D or ←/→ steer, Space (or
 * Esc) pause, H horn, C camera, R back on the road. Every on-screen button does the same as its key and lights up
 * when the key is used. Touch: big steer buttons bottom-left, horn bottom-centre, brake and accelerator bottom-right;
 * camera, reset, pause and sound small in the top-right corner. No place title: the km readout under the speed says
 * where you are.
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
  const [screen, setScreen] = useState<"start" | "drive" | "paused" | "between" | "finished" | "gate">("start");
  const [driverName, setDriverName] = useState(""), [roster, setRoster] = useState<string[]>([]), [invited, setInvited] = useState("");
  const [shared, setShared] = useState(""), [view, setView] = useState<View>(game.view), [mode, setMode] = useState<QualityMode>(quality.mode);
  const room = useRef<HTMLDivElement>(null), seenVersion = useRef(-1);
  const km = useRef<HTMLElement>(null), kmTotal = useRef<HTMLSpanElement>(null), kmBar = useRef<HTMLElement>(null);
  const speed = useRef<HTMLElement>(null), note = useRef<HTMLDivElement>(null);
  const summary = useRef({ km: 0, min: 0, sec: 0, best: 0, isNew: false, recorded: false }), buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const flash = (name: string) => { const b = buttons.current[name]; if (!b) return; b.dataset.on = "1"; setTimeout(() => { delete b.dataset.on; }, 220); };

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
      if (km.current) km.current.textContent = game.km.toFixed(1);
      // multiplayer: how many drivers share your road; the pause menu's list follows the roster
      if (room.current) room.current.textContent = !net.enabled || net.status === "off" ? "" : net.status === "live" ? `${net.roster.length + 1} driver${net.roster.length ? "s" : ""} in your room` : "Connecting…";
      if (net.version !== seenVersion.current) { seenVersion.current = net.version; setRoster(net.roster.map((p) => p.name)); }
      if (kmTotal.current && game.kmTotal) kmTotal.current.textContent = ` / ${game.kmTotal.toFixed(1)}`;
      if (kmBar.current && game.kmTotal) kmBar.current.style.transform = `scaleX(${Math.min(1, game.km / game.kmTotal)})`;
      if (note.current) note.current.textContent = game.scrape > 0.05 ? "Scraping the barrier" : game.bump > 0.25 ? "Bump" : "";
      engine(horn.sound && game.started && game.phase === "drive" && !game.paused, game.speed, game.input.throttle);
      const want = !game.started ? "start" : game.phase !== "drive" ? game.phase : game.paused ? "paused" : "drive";
      if (game.phase !== "drive") {
        const S = summary.current;
        Object.assign(S, { km: (game.odometer * 10) / 1000, min: game.clock / 60, sec: game.clock });
        // a finished climb (stopped past the Lakkidi gate): your time against your best, once
        if (game.phase === "gate" && !S.recorded) { Object.assign(S, recordClimb(game.clock), { recorded: true }); }
      } else summary.current.recorded = false;
      setScreen((s) => (s === want ? s : want));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); engine(false, 0, 0); };
  }, []);

  // the name you drive under (multiplayer), remembered on this device
  useEffect(() => { try { setDriverName(localStorage.getItem("wayanad-name") ?? ""); } catch {} }, []);
  const start = () => {
    game.started = true; game.phase = "drive"; game.paused = false;
    if (net.enabled) {
      const name = cleanName(driverName);
      try { localStorage.setItem("wayanad-name", name); } catch {}
      setDriverName(name);
      void joinRoom(name, new URLSearchParams(location.search).get("room"));
    }
  };
  // an invite: this room's link, through the share sheet or copied
  const invite = async () => {
    const url = `${location.origin}/?room=${net.room}`, nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: "Explore Wayanad", text: "Drive the Thamarassery Churam with me:", url }); return; } catch (e) { if ((e as DOMException).name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); setInvited("Link copied"); setTimeout(() => setInvited(""), 2500); } catch {}
  };
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
      <div data-hud>
      <div className={styles.top}>
        <div className={styles.speed}>
          <b ref={speed}>0</b><small>km/h</small>
          <div ref={room} className={styles.room} />
          <div className={styles.km} aria-label="Distance along the churam"><span>KM</span> <em ref={km}>0.0</em><span ref={kmTotal}> / 0.0</span><i><u ref={kmBar} /></i></div>
        </div>
      </div>
      <div ref={note} className={styles.note} aria-live="polite" />

      <div className={styles.buttons}>
        <button type="button" ref={ref("horn")} className={styles.hornKey} onClick={() => { honk({ audible: true }); flash("horn"); }} title="Horn (H)" aria-label="Horn"><Icon name="horn" /></button>
        <button type="button" ref={ref("view")} onClick={() => { cycleView(); setView(game.view); flash("view"); }} title={`Camera: ${VIEW_NAME[view]} (C)`} aria-label={`Camera: ${VIEW_NAME[view]}`}><Icon name="view" /></button>
        <button type="button" ref={ref("reset")} onClick={() => { resetCar(); flash("reset"); }} title="Back on the road (R)" aria-label="Back on the road"><Icon name="reset" /></button>
        <button type="button" ref={ref("pause")} onClick={() => togglePause()} title="Pause (Space)" aria-label="Pause"><Icon name="pause" /></button>
        <Sound icon />
        <ThemeToggle className={styles.themeKey} />
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

      </div>

      {screen === "start" && (
        <StartScreen
          eyebrow="Drive mode · The churam"
          title={<>Drive the<br />churam.</>}
          lead="From Adivaram, nine hairpins up to the Lakkidi gate in traffic. Keep left; overtake on the right when the road is clear. Showers come and go."
          stats={[["Adivaram", "From"], ["Lakkidi", "To"], ["9", "Hairpins"]]}
          startLabel="Start drive" onStart={start} presentedBy={PRESENTED_BY}
          beforeStart={net.enabled ? (
            <div className={panelStyles.nameField}>
              <label htmlFor="driver-name">Your name</label>
              <input id="driver-name" value={driverName} maxLength={16} autoComplete="nickname" placeholder="Shown above your car"
                onChange={(e) => setDriverName(e.target.value)} onKeyDown={(e) => { if (e.key !== "Enter") e.stopPropagation(); }} />
              <small>Other drivers on the road see it. Leave it empty to drive as “Driver 123”.</small>
            </div>
          ) : null}
          panel={<>
            <h2>Controls</h2>
            <div className={panelStyles.keyOnly}>
              <ControlRow label="Accelerate"><kbd>W</kbd><kbd>↑</kbd></ControlRow>
              <ControlRow label="Brake, reverse"><kbd>S</kbd><kbd>↓</kbd></ControlRow>
              <ControlRow label="Steer"><kbd>A</kbd><kbd>D</kbd><kbd>←</kbd><kbd>→</kbd></ControlRow>
              <ControlRow label="Horn"><kbd>H</kbd></ControlRow>
              <ControlRow label="Camera · back on the road"><kbd>C</kbd><kbd>R</kbd></ControlRow>
              <ControlRow label="Pause"><kbd>Space</kbd></ControlRow>
            </div>
            <div className={panelStyles.touchOnly}>
              <ControlRow label="Steer"><kbd>◀</kbd><kbd>▶</kbd></ControlRow>
              <ControlRow label="Accelerate · brake"><kbd>▲</kbd><kbd>▼</kbd></ControlRow>
              <ControlRow label="Horn"><kbd>middle</kbd></ControlRow>
            </div>
            <p>Sound the horn behind a slow vehicle and it gives way where it&apos;s safe. Oncoming traffic doesn&apos;t, on the hairpins.</p>
          </>}
        />
      )}
      {screen === "paused" && (
        <div className={styles.card} role="dialog" aria-label="Paused">
          <p className={styles.eyebrow}>Drive mode</p>
          <h1>Paused</h1>
          <div className={styles.row}>
            <button type="button" className={styles.go} onClick={() => togglePause(false)} autoFocus>Resume</button>
            <button type="button" className={styles.ghostButton} onClick={restart}>Restart from Adivaram</button>
          </div>
          <div className={styles.setting} role="group" aria-label="Graphics">
            <span>Graphics</span>
            {QUALITY.map((q) => <button key={q} type="button" aria-pressed={mode === q} onClick={() => chooseQuality(q)}>{q[0].toUpperCase() + q.slice(1)}</button>)}
          </div>
          {net.enabled && net.status !== "off" && (
            <div className={styles.setting}>
              <span>{roster.length ? `On the road with you: ${roster.join(", ")}` : "No one else on your road yet"}</span>
              <button type="button" onClick={() => void invite()}>{invited || "Invite a friend"}</button>
            </div>
          )}
          <Sponsors />
        </div>
      )}
      {screen === "between" && (
        <div className={styles.card} role="dialog" aria-label="Kalpetta">
          <p className={styles.eyebrow}>Kalpetta</p>
          <h1>Kalpetta</h1>
          <p>The road on to Sulthan Bathery (24 km) isn&apos;t built yet. The drive carries on from Sulthan Bathery, through the forest to the border.</p>
          <button type="button" className={styles.go} onClick={onward} autoFocus>Drive on from Sulthan Bathery</button>
        </div>
      )}
      {screen === "gate" && (
        <div className={styles.card} role="dialog" aria-label="Lakkidi gate">
          <p className={styles.eyebrow}>Lakkidi gate · end of the drive</p>
          <h1>Welcome to Wayanad.</h1>
          <div className={styles.result}>
            <div><span>Your time</span><b>{clock(summary.current.sec)}</b></div>
            <div><span>{summary.current.isNew ? "New best" : "Your best"}</span><b>{clock(summary.current.best)}</b></div>
            <div><span>Distance</span><b>{summary.current.km.toFixed(1)} km</b></div>
          </div>
          {STAY && (
            <div className={styles.stay}>
              <span>Where to stay tonight</span>
              <b>{STAY.name}</b>
              <em>{STAY.offer}</em>
              {STAY.url && <a href={STAY.url} target="_blank" rel="noopener noreferrer sponsored">See the stay</a>}
            </div>
          )}
          <p>The road on past the gate, through Vythiri and Kalpetta to the forest and the border, opens in the next update. Thanks for driving.</p>
          <div className={styles.row}>
            <button type="button" className={styles.go} autoFocus
              onClick={() => void shareClimb(summary.current.sec).then((r) => { if (r === "copied") { setShared("Link copied"); setTimeout(() => setShared(""), 2500); } })}>{shared || "Share your time"}</button>
            <button type="button" className={styles.ghostButton} onClick={restart}>Drive again</button>
          </div>
        </div>
      )}
      {screen === "finished" && (
        <div className={styles.card} role="dialog" aria-label="The border">
          <p className={styles.eyebrow}>Muthanga · the border</p>
          <h1>The border gate</h1>
          <p>Kerala ends at the barrier; Karnataka is on the other side. You drove {summary.current.km.toFixed(1)} km in {Math.max(1, Math.round(summary.current.min))} min.</p>
          <div className={styles.row}>
            <button type="button" className={styles.go} onClick={restart} autoFocus>Drive again</button>
          </div>
        </div>
      )}
    </>
  );
}

/** The sponsors (boards, buses, title, stay: data/sponsors.ts), with links; while none are sold, a way to ask about advertising. */
function Sponsors() {
  const sold = linkedSponsors();
  if (sold.length) return (
    <div className={styles.setting}>
      <span>{PRESENTED_BY ? `Presented by ${PRESENTED_BY.name} · on the road` : "On the road"}</span>
      {sold.map((s) => <a key={s.name} className={styles.sponsor} href={s.url!} target="_blank" rel="noopener noreferrer sponsored">{s.name}</a>)}
    </div>
  );
  if (!WHATSAPP.number) return null;
  return <a className={styles.ghost} href={`https://wa.me/${WHATSAPP.number}?text=${encodeURIComponent("Hi, I'd like to advertise on a roadside board in the Explore Wayanad drive.")}`} target="_blank" rel="noopener noreferrer">Advertise on this road</a>;
}
