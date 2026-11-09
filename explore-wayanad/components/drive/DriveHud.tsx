"use client";
import { useEffect, useRef, useState } from "react";
import { game, resetCar, togglePause, VIEWS, type View } from "@/lib/game";
import { beep, honk, horn } from "@/lib/horn";
import { engine } from "@/lib/engine";
import { ambience } from "@/lib/ambience";
import { weather } from "@/lib/weather";
import { nightness } from "@/lib/theme";
import { quality, setQualityMode, type QualityMode } from "@/lib/quality";
import Sound from "@/components/ui/Sound";
import ThemeToggle from "@/components/ui/ThemeToggle";
import StartScreen, { panelStyles } from "@/components/ui/StartScreen";
import { clock, recordClimb } from "@/lib/share";
import { loading } from "@/lib/loading";
import { mark } from "@/lib/stats";
import { shareCard } from "@/lib/shareCard";
import { begin, finish, resetPenalty, score } from "@/lib/score";
import { BADGES, award, earned, finishBadges, startRun, badges as badgeState } from "@/lib/badges";
import { PRESENTED_BY, STAY, linkedSponsors } from "@/data/sponsors";
import { INSTAGRAM, WHATSAPP } from "@/data/plan";
import { joinRoom, leaveRoom, net, partyFinish, partyLobby, partyStart } from "@/lib/net";
import { FriendsCard, GIcon, Podium, PlayModes, RoomCard, showCode, type PlayMode } from "./Party";
import partyStyles from "./Party.module.scss";
import { gapText, ordinal, racing, standings, watch, type Row } from "@/lib/race";
import { mirror } from "@/lib/mirror";
import { cleanName } from "@/lib/names";
import CarPicker from "@/components/garage/CarPicker";
import HornPicker from "@/components/garage/HornPicker";
import CarCard from "@/components/garage/CarCard";
import { getChoice, setChoice, useChoice } from "@/lib/choice";
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
  back: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  view: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="m8 7 2-3h4l2 3" /><circle cx="12" cy="13.5" r="3.5" /></>,
  reset: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /></>,
  pause: <path d="M8 5v14M16 5v14" />,
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
  go: <path d="m6 15 6-6 6 6" />,
  brake: <path d="m6 9 6 6 6-6" />,
  expand: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  shrink: <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />,
};
const Icon = ({ name }: { name: keyof typeof ICON }) => <svg viewBox="0 0 24 24" aria-hidden>{ICON[name]}</svg>;
/** The start screen's controls: one tile per control, its icon, a short label and (keyboard) its key. */
const Tip = ({ icon, label, keys }: { icon: keyof typeof ICON | [keyof typeof ICON, keyof typeof ICON]; label: string; keys?: string }) => (
  <div className={panelStyles.tip}>
    <span className={panelStyles.tipIcon}>{Array.isArray(icon) ? <><Icon name={icon[0]} /><Icon name={icon[1]} /></> : <Icon name={icon} />}</span>
    <span>{label}</span>
    {keys && <kbd>{keys}</kbd>}
  </div>
);
/** Short names keep the labels over the cars readable (the server allows a little more). */
const NAME_MAX = 10;
const QUALITY: QualityMode[] = ["auto", "high", "medium", "low"];

/** The next camera view; remembered for next time. */
function cycleView() {
  game.view = VIEWS[(VIEWS.indexOf(game.view) + 1) % VIEWS.length];
  try { localStorage.setItem("drive-view", game.view); } catch {}
}
/** Back to Adivaram: the whole drive from the start. */
function restart() {
  Object.assign(game, { leg: 0, phase: "drive", odometer: 0, clock: 0, paused: false, jumped: false });
  resetCar(3);
  begin(game.s); startRun();
}
/** R / the reset button: back in lane, for a price once you're driving. */
function backOnRoad() {
  if (game.started && game.phase === "drive" && !game.paused) resetPenalty();
  resetCar();
}

export default function DriveHud() {
  const [screen, setScreen] = useState<"start" | "drive" | "paused" | "between" | "finished" | "gate" | "room">("start");
  // how to play (multiplayer): alone, on the open road with everyone, or in a private room with friends
  const [playMode, setPlayMode] = useState<PlayMode>("open"), [friends, setFriends] = useState(false), [inviteCode, setInviteCode] = useState("");
  const [, setPartyV] = useState(0), partySeen = useRef(""), countdown = useRef<HTMLDivElement>(null);
  const choice = useChoice(), [garage, setGarage] = useState(false);
  const [driverName, setDriverName] = useState(""), [roster, setRoster] = useState<string[]>([]), [invited, setInvited] = useState("");
  const [view, setView] = useState<View>(game.view), [mode, setMode] = useState<QualityMode>(quality.mode);
  // full screen (Android and others: browsers allow it only from a tap, so Start asks, and the ⛶ key); iPhone can't —
  // there the first drive shows how: ≡ → Hide Toolbar, or Add to Home Screen (app/manifest.ts)
  const [canFull, setCanFull] = useState(false), [isFull, setIsFull] = useState(false), [iosTip, setIosTip] = useState(false);
  useEffect(() => {
    setCanFull(!!document.fullscreenEnabled && matchMedia("(pointer: coarse)").matches);
    const f = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  const goFull = (on: boolean) => {
    try {
      if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
      else if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    } catch {}
  };
  // phones (the title screen's one-column layout): the car as one card that opens a sheet, instead of the full picker
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const m = matchMedia("(max-width: 860px), (pointer: coarse) and (max-height: 500px)"), f = () => setPhone(m.matches); // (sideways too)
    f(); m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  const room = useRef<HTMLDivElement>(null), seenVersion = useRef(-1);
  const km = useRef<HTMLElement>(null), kmTotal = useRef<HTMLSpanElement>(null), kmBar = useRef<HTMLElement>(null);
  const race = useRef<HTMLDivElement>(null), raceLine = useRef<HTMLDivElement>(null), raceAt = useRef(0);
  const streaks = useRef<HTMLDivElement>(null);
  const tea = useRef<HTMLDivElement>(null), points = useRef<HTMLElement>(null), mult = useRef<HTMLElement>(null), pops = useRef<HTMLDivElement>(null);
  const speed = useRef<HTMLElement>(null), note = useRef<HTMLDivElement>(null), rim = useRef<HTMLDivElement>(null);
  const summary = useRef({ km: 0, min: 0, sec: 0, best: 0, isNew: false, recorded: false, race: "" }), buttons = useRef<Record<string, HTMLButtonElement | null>>({});
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
      if (k === "b") { game.lookBack = true; buttons.current.back?.setAttribute("data-on", "1"); }
      if (k === "r" && !game.paused) { backOnRoad(); flash("reset"); }
      held.add(k); apply();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "b") { game.lookBack = false; buttons.current.back?.removeAttribute("data-on"); }
      held.delete(k); apply();
    };
    const blur = () => { held.clear(); apply(); game.lookBack = false; };
    addEventListener("keydown", down); addEventListener("keyup", up); addEventListener("blur", blur);
    return () => { removeEventListener("keydown", down); removeEventListener("keyup", up); removeEventListener("blur", blur); };
  }, []);

  // readouts, engine note, and the screens the drive asks for
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (speed.current) speed.current.textContent = String(Math.round(Math.abs(game.speed) * 36));
      // speed streaks at the screen's edges, stronger the faster you go (a little flicker so they seem to rush past)
      if (streaks.current) {
        const on = game.started && game.phase === "drive" && !game.paused ? game.speedFx : 0;
        streaks.current.style.opacity = on > 0.02 ? (on * (0.55 + Math.random() * 0.15)).toFixed(3) : "0";
        if (on > 0.02) streaks.current.style.setProperty("--spin", `${(Math.random() * 6).toFixed(1)}deg`);
      }
      if (km.current) km.current.textContent = game.km.toFixed(1);
      // multiplayer: how many drivers share your road; the pause menu's list follows the roster
      if (room.current) room.current.textContent = !net.enabled || net.status === "off" ? "" : net.status === "live" ? `${net.roster.length + 1} driver${net.roster.length ? "s" : ""} in your room` : "Connecting…";
      if (game.started && game.phase === "drive" && net.roster.length) award("friend"); // someone else on your road
      if (net.version !== seenVersion.current) { seenVersion.current = net.version; setRoster(net.roster.map((p) => p.name)); setPartyV(net.version); }
      // a private room (Play with friends): follow its rounds — back to the lobby, a countdown and race, a free drive
      const P = net.party, racer = !!P && P.racers.includes(net.id);
      if (P && P.round >= 0) {
        const key = `${P.round}:${P.phase}`;
        if (key !== partySeen.current) {
          const newRound = partySeen.current.split(":")[0] !== String(P.round);
          partySeen.current = key;
          if (P.phase === "lobby" && (newRound || game.started)) { restart(); game.started = false; }
          else if ((P.phase === "countdown" || P.phase === "race") && racer && newRound) { restart(); game.started = true; }
          else if (P.phase === "free" && newRound) { restart(); game.started = true; }
        }
      } else if (!P) partySeen.current = "";
      game.hold = !!P && P.phase === "countdown" && racer;
      // the countdown: 3, 2, 1, GO! in the middle of the screen, with a beep each
      if (countdown.current) {
        let text = "";
        if (P && racer && (P.phase === "countdown" || P.phase === "race")) { const ms = P.startAt - performance.now(); text = ms > 0 ? String(Math.ceil(ms / 1000)) : ms > -900 ? "GO!" : ""; }
        if (countdown.current.textContent !== text) {
          countdown.current.textContent = text;
          if (text) { beep(text === "GO!"); countdown.current.removeAttribute("data-on"); void countdown.current.offsetWidth; countdown.current.setAttribute("data-on", ""); countdown.current.toggleAttribute("data-go", text === "GO!"); }
        }
      }
      // the race with the others in the room (lib/race): passes float up each frame, the standings redrawn 5 times a second
      watch();
      if (performance.now() > raceAt.current) {
        raceAt.current = performance.now() + 200; drawRace(race.current, raceLine.current);
        // the radar (components/drive/Radar) sits under the speed and km readouts, however tall they've grown
        const bottom = km.current?.parentElement?.getBoundingClientRect().bottom ?? 0;
        document.documentElement.style.setProperty("--hud-bottom", `${Math.round(bottom)}px`);
      }
      if (kmTotal.current && game.kmTotal) kmTotal.current.textContent = ` / ${game.kmTotal.toFixed(1)}`;
      if (kmBar.current && game.kmTotal) kmBar.current.style.transform = `scaleX(${Math.min(1, game.km / game.kmTotal)})`;
      if (rim.current) { rim.current.style.opacity = mirror.amount > 0.01 ? mirror.amount.toFixed(2) : "0"; rim.current.toggleAttribute("data-on", mirror.amount > 0.5); }
      // the score, its clean-driving multiplier, and each gain or loss floating up from the car
      if (points.current) { const t = score.points.toLocaleString("en-IN"); if (points.current.textContent !== t) points.current.textContent = t; }
      if (mult.current) { const t = score.mult > 1 ? `×${score.mult}` : ""; if (mult.current.textContent !== t) mult.current.textContent = t; }
      for (let p = score.pops.shift(); p; p = score.pops.shift()) {
        if (!pops.current || game.phase !== "drive") continue;
        const el = document.createElement("span");
        el.textContent = p.text; el.dataset.kind = p.kind; el.style.setProperty("--x", `${Math.round((Math.random() - 0.5) * 70)}px`);
        el.addEventListener("animationend", () => el.remove());
        pops.current.appendChild(el);
      }
      // the tea stall below Lakkidi: a word as you come up to it, until you've had your tea this climb
      const toStall = game.stall - game.s, teaDue = game.stall > 0 && game.teaRun !== score.run && game.phase === "drive";
      const teaNote = !teaDue ? "" : Math.abs(toStall) < 0.45 ? (Math.abs(game.speed) < 0.03 ? "☕ Ordering a chaya…" : "☕ Stop here for a chai break") : toStall > 0 && toStall < 10 ? `☕ Tea stall in ${Math.round(toStall * 10)} m — stop for a chai break` : "";
      if (note.current) note.current.textContent = game.scrape > 0.05 ? "Scraping the barrier" : game.bump > 0.25 ? "Bump" : teaNote;
      // the tea itself, for a few seconds after it's served
      const served = game.tea > 0 && performance.now() - game.tea < 4500;
      if (tea.current) tea.current.toggleAttribute("data-on", served);
      engine(horn.sound && game.started && game.phase === "drive" && !game.paused, game.speed, game.input.throttle);
      ambience({ on: horn.sound && game.started && game.phase === "drive" && !game.paused, rain: weather.rain, night: nightness(), hood: game.view === "hood", speed: game.speed });
      const roomScreen = !!P && (P.phase === "lobby" || (P.phase !== "free" && !racer));
      const want = roomScreen ? "room" : !game.started ? "start" : game.phase !== "drive" ? game.phase : game.paused ? "paused" : "drive";
      if (game.phase !== "drive") {
        const S = summary.current;
        Object.assign(S, { km: (game.odometer * 10) / 1000, min: game.clock / 60, sec: game.clock });
        // a finished climb (stopped past the Lakkidi gate): your time against your best, once
        if (game.phase === "gate" && !S.recorded) { Object.assign(S, recordClimb(game.clock, !game.jumped), { recorded: true, race: "" }); if (racing()) { const r = standings(); S.race = `${ordinal(r.me + 1)} of ${r.total}`; } finish(game.clock, !game.jumped); if (P && P.mode === "race" && P.phase === "race" && racer) partyFinish(game.clock, score.points); if (!game.jumped) { mark("finished"); finishBadges({ crashes: score.crashes, hairpins: score.big, sec: game.clock }); } }
      } else summary.current.recorded = false;
      if (loading.ready) mark("loaded");
      setScreen((s) => (s === want ? s : want));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); engine(false, 0, 0); ambience({ on: false, rain: 0, night: 0, hood: false, speed: 0 }); };
  }, []);

  // iPhone in Safari, first drive: how to get the bars out of the way (once per device; not when opened from the Home Screen)
  useEffect(() => {
    if (screen !== "drive") return;
    const nav = navigator as Navigator & { standalone?: boolean };
    if (!/iP(hone|od)/.test(nav.userAgent) || nav.standalone || matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches) return;
    try { if (localStorage.getItem("wayanad-ios-tip")) return; localStorage.setItem("wayanad-ios-tip", "1"); } catch { return; }
    setIosTip(true);
    const t = setTimeout(() => setIosTip(false), 10000);
    return () => clearTimeout(t);
  }, [screen]);
  // the name you drive under (multiplayer), remembered on this device; how you played last time; an invite's room code
  useEffect(() => {
    try { setDriverName((localStorage.getItem("wayanad-name") ?? "").slice(0, NAME_MAX)); } catch {}
    const q = new URLSearchParams(location.search), code = q.get("code");
    if (code) { setInviteCode(code.toUpperCase()); setPlayMode("friends"); return; }
    if (q.get("room")) { setPlayMode("open"); return; }
    try { const m = localStorage.getItem("wayanad-mode") as PlayMode | null; if (m === "solo" || m === "open" || m === "friends") setPlayMode(m); } catch {}
  }, []);
  const choosePlayMode = (m: PlayMode) => { setPlayMode(m); try { localStorage.setItem("wayanad-mode", m); } catch {} };
  /** The name as it'll be shown: cleaned, remembered, on your plate. */
  const commitName = () => {
    const name = cleanName(driverName.slice(0, NAME_MAX));
    try { localStorage.setItem("wayanad-name", name); } catch {}
    setDriverName(name); game.driver = name;
    return name;
  };
  /** Leave a private room: back to the title screen. */
  const leaveParty = () => { leaveRoom(true); restart(); game.started = false; setFriends(false); setInviteCode(""); };
  const start = () => {
    if (canFull) goFull(true);
    // Play with friends: the room comes first (make one, or join with a code); the drive starts from its lobby
    if (net.enabled && playMode === "friends") { commitName(); setFriends(true); return; }
    // for testing: ?at=end starts 1 km before the end of the drive (just before the Lakkidi gate), ?at=6.5 that many km
    // up from Adivaram. A climb started part-way isn't kept as your best time.
    const at = new URLSearchParams(location.search).get("at");
    if (at && game.kmTotal) {
      const km = at === "end" ? game.kmTotal - 1 : Number(at);
      if (km > 0) { resetCar(Math.min(game.kmTotal - 0.05, km) * 100); game.jumped = true; }
    }
    game.started = true; game.phase = "drive"; game.paused = false;
    begin(game.s); startRun();
    mark("started");
    if (net.enabled) {
      const name = commitName();
      if (playMode === "open") void joinRoom(name, new URLSearchParams(location.search).get("room"), getChoice());
      else if (net.status !== "off") leaveRoom(true);
    }
  };
  // an invite: this room's link, through the share sheet or copied
  const invite = async () => {
    const url = `${location.origin}/?room=${net.room}`, nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: "Explore Wayanad", text: "Drive the Thamarassery Churam with me:", url }); return; } catch (e) { if ((e as DOMException).name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); setInvited("Link copied"); setTimeout(() => setInvited(""), 2500); } catch {}
  };
  // the share card (lib/shareCard): your climb as a picture for WhatsApp or a story
  const [sharing, setSharing] = useState("");
  const shareScore = async () => {
    setSharing("Making your card…");
    try {
      const r = await shareCard({ name: game.driver, points: score.points, sec: game.clock, coins: score.coins, hairpins: score.big, crashes: score.crashes, badges: earned() });
      setSharing(r === "downloaded" ? "Saved — message copied" : "");
      if (r === "downloaded") setTimeout(() => setSharing(""), 3000);
    } catch { setSharing(""); }
  };
  const onward = () => { game.leg = 1; game.phase = "drive"; resetCar(3); };
  const chooseQuality = (m: QualityMode) => { setQualityMode(m); setMode(m); };
  // touch: hold to press; leaving the button lets go. `data-on` shows it pressed (sunk in) while held.
  const hold = (set: (on: boolean) => void) => ({
    onPointerDown: (e: React.PointerEvent) => { (e.target as Element).setPointerCapture?.(e.pointerId); e.currentTarget.setAttribute("data-on", ""); set(true); },
    onPointerUp: (e: React.PointerEvent) => { e.currentTarget.removeAttribute("data-on"); set(false); },
    onPointerCancel: (e: React.PointerEvent) => { e.currentTarget.removeAttribute("data-on"); set(false); },
    onPointerLeave: (e: React.PointerEvent) => { e.currentTarget.removeAttribute("data-on"); set(false); },
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
          <div className={styles.score} aria-label="Score"><em ref={points}>0</em><b ref={mult} /></div>
          <div ref={race} className={styles.race} aria-label="Race to Lakkidi" hidden>
            <header><i aria-hidden /><span>Race</span><b><em /><sup /><small /></b></header>
            {[0, 1, 2, 3, 4].map((i) => <p key={i}><i /><span /><em /></p>)}
            <small />
          </div>
          <div ref={raceLine} className={styles.raceLine} hidden><b /><span /></div>
        </div>
      </div>
      <div ref={streaks} className={styles.streaks} aria-hidden />
      {iosTip && (
        <div className={styles.iosTip} role="status">
          <span><b>Full screen on iPhone</b>Tap <i>≡</i> beside the address, then <b>Hide Toolbar</b>. Or Share → <b>Add to Home Screen</b> to play like an app.</span>
          <button type="button" onClick={() => setIosTip(false)} aria-label="Close">✕</button>
        </div>
      )}
      <div ref={rim} className={styles.mirror} data-mirror aria-hidden />
      <div ref={note} className={styles.note} aria-live="polite" />
      <div ref={pops} className={styles.pops} aria-hidden />
      <div ref={countdown} className={styles.countdown} aria-live="assertive" />
      <div ref={tea} className={styles.tea} role="status" aria-live="polite">
        <TeaGlass />
        <div><b>Chai break at Lakkidi</b><span>A glass of chaya and a pazhampori, hot from the kettle. +50</span></div>
      </div>

      <div className={styles.buttons}>
        <button type="button" ref={ref("horn")} className={styles.hornKey} onClick={() => { honk({ audible: true }); flash("horn"); }} title="Horn (H)" aria-label="Horn"><Icon name="horn" /></button>
        <button type="button" ref={ref("view")} onClick={() => { cycleView(); setView(game.view); flash("view"); }} title={`Camera: ${VIEW_NAME[view]} (C)`} aria-label={`Camera: ${VIEW_NAME[view]}`}><Icon name="view" /></button>
        <button type="button" ref={ref("back")} className={styles.backKey} {...hold((on) => { game.lookBack = on; })} title="Look back (hold B)" aria-label="Look back (hold)"><Icon name="back" /></button>
        <button type="button" ref={ref("reset")} onClick={() => { backOnRoad(); flash("reset"); }} title="Back on the road (R)" aria-label="Back on the road"><Icon name="reset" /></button>
        <button type="button" ref={ref("pause")} onClick={() => togglePause()} title="Pause (Space)" aria-label="Pause"><Icon name="pause" /></button>
        {canFull && <button type="button" onClick={() => goFull(!isFull)} title={isFull ? "Exit full screen" : "Full screen"} aria-label={isFull ? "Exit full screen" : "Full screen"}><Icon name={isFull ? "shrink" : "expand"} /></button>}
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
          <button type="button" className={styles.brake} {...hold((on) => { if (!game.paused) game.input.brake = on ? 1 : 0; })}><Icon name="brake" /><small>Brake</small></button>
          <button type="button" className={styles.gas} {...hold((on) => { if (!game.paused) game.input.throttle = on ? 1 : 0; })}><Icon name="go" /><small>Gas</small></button>
        </div>
      </div>

      </div>

      {screen === "start" && (
        <StartScreen compact
          title={<>Drive to <br />Wayanad.</>}
          startLabel={!net.enabled || playMode === "solo" ? "Start drive" : playMode === "open" ? "Drive with everyone" : inviteCode ? `Join room ${showCode(inviteCode)}` : "Play with friends"}
          onStart={start} presentedBy={PRESENTED_BY}
          beforeStart={<>
            {net.enabled && (
              <div className={panelStyles.nameField} data-big>
                <label htmlFor="driver-name">Your name</label>
                <div className={panelStyles.nameBox}>
                  <input id="driver-name" value={driverName} maxLength={NAME_MAX} autoComplete="nickname" placeholder="A short name" spellCheck={false}
                    onChange={(e) => setDriverName(e.target.value.slice(0, NAME_MAX))} onKeyDown={(e) => { if (e.key !== "Enter") e.stopPropagation(); }} />
                  <span aria-hidden>{driverName.length}/{NAME_MAX}</span>
                </div>
                <small>On your number plate, and above your car for other drivers</small>
              </div>
            )}
            {phone ? <CarCard /> : (<>
              <div className={panelStyles.nameField}>
                <label>Your car</label>
                <CarPicker value={choice} onChange={setChoice} />
              </div>
              <div className={panelStyles.nameField}>
                <label>Your horn</label>
                <HornPicker />
              </div>
            </>)}
            {net.enabled && (
              <div className={panelStyles.nameField}>
                <label>How to play</label>
                <PlayModes value={playMode} onChange={choosePlayMode} code={inviteCode} />
              </div>
            )}
          </>}
          panel={<>
            <h2>Controls</h2>
            <div className={panelStyles.keyOnly}>
              <div className={panelStyles.drive}>
                <div className={panelStyles.arrows} aria-hidden><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div>
                <p><b>Drive · steer</b><small>Arrows or W A S D<br />Hold ↓ to brake, then reverse</small></p>
              </div>
              <div className={panelStyles.tips}>
                <Tip icon="horn" label="Horn" keys="H" />
                <Tip icon="view" label="Camera" keys="C" />
                <Tip icon="reset" label="Reset" keys="R" />
                <Tip icon="back" label="Look back" keys="B" />
                <Tip icon="pause" label="Pause" keys="Space" />
              </div>
            </div>
            <div className={panelStyles.touchOnly}>
              <div className={panelStyles.tips}>
                <Tip icon={["left", "right"]} label="Steer" />
                <Tip icon={["go", "brake"]} label="Gas · brake" />
                <Tip icon="horn" label="Horn" />
              </div>
            </div>
          </>}
        />
      )}
      {screen === "start" && friends && !net.party && (
        <FriendsCard name={game.driver} car={choice} auto={inviteCode || undefined} onBack={() => { setFriends(false); setInviteCode(""); }} />
      )}
      {screen === "room" && <RoomCard me={choice} onLeave={leaveParty} />}
      {screen === "paused" && (
        <div className={styles.card} role="dialog" aria-label="Paused">
          <p className={styles.eyebrow}>Drive mode</p>
          <h1>Paused</h1>
          <div className={styles.row}>
            <button type="button" className={styles.go} onClick={() => togglePause(false)} autoFocus>Resume</button>
            <button type="button" className={styles.ghostButton} onClick={() => setGarage((g) => !g)}>{garage ? "Done" : "Change car"}</button>
            {!(net.party && net.party.mode === "race") && <button type="button" className={styles.ghostButton} onClick={restart}>Restart from Adivaram</button>}
          </div>
          {net.party && (
            <div className={styles.setting} role="group" aria-label={`Room ${net.party.code}`}>
              <span>Room {showCode(net.party.code)}{net.party.host === net.id ? " · you're the host" : ""}</span>
              {net.party.host === net.id && <button type="button" onClick={() => partyLobby()}>{net.party.mode === "race" ? "End race · back to room" : "Back to room"}</button>}
              <button type="button" onClick={leaveParty}>Leave room</button>
            </div>
          )}
          {garage && <CarPicker value={choice} onChange={setChoice} />}
          <BadgeStrip />
          <div className={styles.setting} role="group" aria-label="Horn">
            <span>Horn</span>
            <HornPicker />
          </div>
          <div className={styles.setting} role="group" aria-label="Graphics">
            <span>Graphics</span>
            {QUALITY.map((q) => <button key={q} type="button" aria-pressed={mode === q} onClick={() => chooseQuality(q)}>{q[0].toUpperCase() + q.slice(1)}</button>)}
          </div>
          {net.enabled && net.status !== "off" && !net.party && (
            <div className={styles.setting}>
              <span>{racing() ? `Race to Lakkidi: ${raceList()}` : roster.length ? `On the road with you: ${roster.join(", ")}` : "No one else on your road yet"}</span>
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
          {net.party?.mode === "race" && <Podium me={choice} />}
          <div className={styles.result}>
            <div><span>Score</span><b className={styles.points}>{score.points.toLocaleString("en-IN")}</b></div>
            <div><span>Total time</span><b>{clock(summary.current.sec)}</b></div>
            <div><span>Distance</span><b>{summary.current.km.toFixed(1)} km</b></div>
          </div>
          <p className={styles.tally}>
            {score.coins} coins · {score.big}/9 hairpin coins · {score.crashes} {score.crashes === 1 ? "crash" : "crashes"}{score.bonus > 0 && <> · time bonus +{score.bonus.toLocaleString("en-IN")}</>}
            {summary.current.race && !net.party && <><br />You reached Lakkidi {summary.current.race} in your room</>}
            <br />{score.isNew ? "Your best score yet" : score.best > 0 ? `Your best: ${score.best.toLocaleString("en-IN")}` : null}
          </p>
          <BadgeStrip />
          {STAY && (
            <div className={styles.stay}>
              <span>Where to stay tonight</span>
              <b>{STAY.name}</b>
              <em>{STAY.offer}</em>
              {STAY.url && <a href={STAY.url} target="_blank" rel="noopener noreferrer sponsored">See the stay</a>}
            </div>
          )}
          {!net.party && <p>Thanks for driving up the churam with us. Tell us what you thought on Instagram, and follow along: the road past the gate, through Vythiri and Kalpetta to the border, opens in the next update.</p>}
          <div className={styles.row}>
            <button type="button" className={styles.go} onClick={() => void shareScore()} disabled={sharing === "Making your card…"} autoFocus>{sharing || "Share my score"}</button>
            <a className={styles.ghostButton} href={INSTAGRAM.url} target="_blank" rel="noopener noreferrer">Share your thoughts</a>
            {!net.party && <button type="button" className={styles.ghostButton} onClick={restart}>Drive again</button>}
          </div>
          {net.party && (
            // a private room: the host starts the next round (once the race is over) or takes everyone back to the room
            <div className={styles.row}>
              {net.party.host === net.id ? (<>
                {net.party.mode === "race" && <button type="button" className={`${partyStyles.key} ${partyStyles.gold}`} onClick={partyStart} disabled={net.party.phase !== "results"}><GIcon name="play" /><span>{net.party.phase === "results" ? "Race again" : "Race again · waiting"}</span></button>}
                <button type="button" className={`${partyStyles.key} ${partyStyles.green}`} onClick={() => partyLobby()}><GIcon name="flag" /><span>Back to room</span></button>
              </>) : (
                <span className={styles.small}>Waiting for the host to start the next round…</span>
              )}
              <button type="button" className={partyStyles.textButton} onClick={leaveParty}><GIcon name="leave" />Leave room</button>
            </div>
          )}
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

/** One driver's gap in the race: to you (+ ahead, − behind), 🏁 at the top, or still at the start. Once you're at the
 * top, the others' distance still to go. */
function raceGap(r: Row, you: Row) {
  if (r.done) return "🏁";
  if (r.waiting) return "at start";
  if (r.me) return "";
  if (you.done) return `${gapText(Math.max(0, game.finishS - r.s)).replace("+", "")} to go`;
  return gapText(r.s - you.s);
}

/** The race panel (desktop: the first three, then the driver just ahead of you and you, and how many are behind you)
 * and its one-line form (phones: the driver just ahead). */
let lastPlace = 0;
function drawRace(box: HTMLDivElement | null, line: HTMLDivElement | null) {
  if (!box || !line) return;
  if (!racing()) { box.hidden = true; line.hidden = true; lastPlace = 0; return; }
  const { rows, me, total } = standings(), you = rows[me], place = me + 1, suffix = ordinal(place).slice(String(place).length);
  box.hidden = false; line.hidden = false;
  const items = box.children, show = [0, 1, 2].filter((i) => i < total);
  if (me >= 3) { if (me - 1 >= 3) show.push(me - 1); show.push(me); } // the one to catch, and you
  // the header: your place, big; it flashes when you move up
  const head = items[0] as HTMLElement, [num, sup, of] = head.querySelectorAll("b > *");
  num.textContent = String(place); sup.textContent = suffix; of.textContent = `/${total}`;
  if (lastPlace && place < lastPlace) for (const el of [head, line]) { el.removeAttribute("data-flash"); void el.offsetWidth; el.setAttribute("data-flash", ""); }
  lastPlace = place;
  for (let i = 0; i < 5; i++) {
    const p = items[i + 1] as HTMLElement, at = show[i], r = rows[at];
    p.hidden = !r;
    if (!r) continue;
    p.toggleAttribute("data-me", r.me);
    p.toggleAttribute("data-gap", i > 0 && at > show[i - 1] + 1); // places skipped above this one
    if (r.place <= 3) p.dataset.medal = String(r.place); else delete p.dataset.medal;
    p.dataset.dir = r.me ? "" : r.done ? "done" : r.waiting ? "" : r.s > you.s ? "ahead" : "behind";
    p.children[0].textContent = String(r.place);
    p.children[1].textContent = r.me ? "You" : r.name;
    p.children[2].textContent = raceGap(r, you);
  }
  const after = total - 1 - Math.max(...show), foot = items[6]; // drivers below the last one shown
  foot.textContent = after > 0 ? `${after} more behind you` : "";
  // phones: "2nd/8" and the driver just ahead (or behind, when you lead)
  const ahead = rows[me - 1], behind = rows[me + 1];
  const pill = `${place}${suffix}/${total}`, text = you.done ? "🏁 at Lakkidi"
    : ahead ? `${ahead.name} ${ahead.done ? "🏁" : `${gapText(Math.abs(ahead.s - you.s)).replace("+", "")} ahead`}`
    : behind && !behind.waiting ? `${behind.name} ${gapText(Math.abs(you.s - behind.s)).replace("+", "")} behind`
    : "leading";
  const [lb, ls] = line.children;
  if (lb.textContent !== pill) lb.textContent = pill;
  if (ls.textContent !== text) ls.textContent = text;
}

/** The whole race in a line, for the pause menu. */
function raceList() {
  const { rows, me } = standings();
  return rows.map((r) => `${r.place} ${r.me ? "You" : r.name}${r.me ? "" : ` ${raceGap(r, rows[me])}`}`).join(" · ");
}

/** A glass of tea with steam, and a pazhampori beside it (the chai-break card). */
function TeaGlass() {
  return (
    <svg viewBox="0 0 96 80" aria-hidden className={styles.teaArt}>
      <g className={styles.teaSteam} fill="none" stroke="rgba(238,242,238,.7)" strokeWidth="2.4" strokeLinecap="round">
        <path d="M30 22c-4-5 4-8 0-14" /><path d="M40 20c-4-5 4-8 0-14" /><path d="M50 22c-4-5 4-8 0-14" />
      </g>
      <path d="M24 28h32l-4 44H28z" fill="rgba(217,236,242,.18)" stroke="rgba(238,242,238,.75)" strokeWidth="2" />
      <path d="M26.5 38h27l-3.2 32H29.7z" fill="#b8742f" />
      <path d="M26.5 38h27l-.5 5h-26z" fill="#e8c9a0" />
      <ellipse cx="76" cy="66" rx="16" ry="8" fill="#c9832b" /><ellipse cx="74" cy="63" rx="9" ry="3.5" fill="#e3a54a" opacity=".8" />
    </svg>
  );
}

/** All the badges: the ones you have bright, the rest faint (hover or tap one for how to get it); new this climb
 * marked. */
function BadgeStrip() {
  const have = earned(), fresh = badgeState.fresh;
  return (
    <div className={styles.badges} role="group" aria-label={`Badges: ${have.length} of ${BADGES.length}`}>
      <span>Badges {have.length}/{BADGES.length}</span>
      <ul>
        {BADGES.map((b) => {
          const got = have.includes(b.id);
          return (
            <li key={b.id} data-got={got || undefined} data-new={fresh.includes(b.id) || undefined} title={`${b.name}${got ? "" : ` — ${b.how}`}`}>
              <span aria-hidden>{b.icon}</span><small>{b.name}</small>
            </li>
          );
        })}
      </ul>
    </div>
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
