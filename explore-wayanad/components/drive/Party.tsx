"use client";
import { useEffect, useState } from "react";
import { createRoom, joinCode, leaveRoom, net, partyLobby, partyMode, partyStart, type Party } from "@/lib/net";
import { VOICE_FX, holdTalk, joinVoice, leaveVoice, setOpenMic, setVoiceFx, toggleMute, voice } from "@/lib/voice";
import { carOf, colourOf, type Choice } from "@/data/cars";
import { clock } from "@/lib/share";
import styles from "./Party.module.scss";

/* Multiplayer screens, in a game's look (chunky keys, gold for what to press, a crown for the host):
 *   PlayModes   the start screen's choice: Solo, Open road (everyone), Play with friends
 *   FriendsCard Play with friends: make a room, or join one with its code
 *   RoomCard    the room's lobby: its code to share, who's in, Race or Free drive, the host's Start
 *   Podium      a race's results at the Lakkidi gate
 * The room itself (lib/net `party`) is the server's; these only show it and send the host's choices. */

export type PlayMode = "solo" | "open" | "friends";
/** A room code as shown: six digits in two threes ("482 913"); older codes as they are. */
export const showCode = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(0, 3)} ${c.slice(3)}` : c);
export const PRIVATE_CAP = 8;

/** Line icons on a 24 grid, drawn thick for the game look. */
const PATHS = {
  solo: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2.2" /><path d="M12 14.2V20.5M9.9 11.3 3.8 9.6M14.1 11.3l6.1-1.7" /></>,
  open: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.6 2.4 3.6 5.3 3.6 8.5s-1 6.1-3.6 8.5c-2.6-2.4-3.6-5.3-3.6-8.5s1-6.1 3.6-8.5z" /></>,
  friends: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.2 19c.6-3.4 3-5.3 5.8-5.3s5.2 1.9 5.8 5.3" /><circle cx="16.6" cy="9.4" r="2.6" /><path d="M15.8 14c2.6-.2 4.5 1.4 5 4.2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  enter: <><path d="M10 7l5 5-5 5" /><path d="M15 12H3.5" /><path d="M13 4h5.5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H13" /></>,
  crown: <path d="M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z" />,
  flag: <><path d="M5 21V4" /><path d="M5 4h13l-2.5 4L18 12H5" /></>,
  car: <><path d="M4 15.5 5.8 10a2 2 0 0 1 1.9-1.4h8.6a2 2 0 0 1 1.9 1.4l1.8 5.5" /><rect x="3" y="14.5" width="18" height="4.5" rx="1.6" /><circle cx="7.5" cy="19.5" r="1.4" /><circle cx="16.5" cy="19.5" r="1.4" /></>,
  share: <><circle cx="17.5" cy="5.5" r="2.5" /><circle cx="6.5" cy="12" r="2.5" /><circle cx="17.5" cy="18.5" r="2.5" /><path d="m8.7 10.8 6.6-4M8.7 13.2l6.6 4" /></>,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="2.2" /><path d="M15.5 8.5V5.7a2.2 2.2 0 0 0-2.2-2.2H5.7a2.2 2.2 0 0 0-2.2 2.2v7.6a2.2 2.2 0 0 0 2.2 2.2h2.8" /></>,
  back: <path d="M15 18l-6-6 6-6" />,
  leave: <><path d="M14 4h4.5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H14" /><path d="M9 7l-5 5 5 5M4 12h11" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  micOff: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16" /></>,
};
export const GIcon = ({ name }: { name: keyof typeof PATHS }) => <svg viewBox="0 0 24 24" aria-hidden className={styles.icon}>{PATHS[name]}</svg>;

/** The start screen's choice of how to play. */
export function PlayModes({ value, onChange, code }: { value: PlayMode; onChange: (m: PlayMode) => void; code?: string }) {
  const modes: [PlayMode, keyof typeof PATHS, string, string][] = [
    ["solo", "solo", "Solo", "Just you"],
    ["open", "open", "Open road", "With everyone"],
    ["friends", "friends", "Friends", code ? `Room ${showCode(code)}` : "Private room"],
  ];
  return (
    <div className={styles.modes} role="radiogroup" aria-label="How to play">
      {modes.map(([id, icon, name, sub]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}>
          <span className={styles.modeIcon}><GIcon name={icon} /></span>
          <span className={styles.modeText}><b>{name}</b><small>{sub}</small></span>
        </button>
      ))}
    </div>
  );
}

/** Play with friends: make a room, or join one by its code. `auto`: a code from an invite link, joined at once. */
export function FriendsCard({ name, car, auto, onBack }: { name: string; car: Choice; auto?: string; onBack: () => void }) {
  const [code, setCode] = useState(auto ?? ""), [busy, setBusy] = useState<"" | "create" | "join">(""), [error, setError] = useState("");
  const go = async (kind: "create" | "join", c = code) => {
    if (kind === "join" && c.replace(/[^a-z0-9]/gi, "").length < 4) { setError("Type the room code your friend sent."); return; }
    setBusy(kind); setError("");
    const err = kind === "create" ? await createRoom(name, car) : await joinCode(c, name, car);
    if (err) { setError(err); setBusy(""); }
  };
  useEffect(() => { if (auto) void go("join", auto); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={styles.veil}>
      <div className={styles.card} role="dialog" aria-label="Play with friends">
        <header className={styles.ribbon}><GIcon name="friends" /><span>Play with friends</span></header>
        <p className={styles.lead}>Race your friends up the churam in a private room. Up to {PRIVATE_CAP} drivers.</p>
        <div className={styles.choices}>
          <button type="button" className={`${styles.key} ${styles.gold} ${styles.big}`} disabled={!!busy} onClick={() => void go("create")}>
            <GIcon name="plus" /><span>{busy === "create" ? "Making your room…" : "Create a room"}</span>
          </button>
          <div className={styles.or}><span>or join one</span></div>
          <form className={styles.join} onSubmit={(e) => { e.preventDefault(); void go("join"); }}>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 14))} placeholder="482 913" aria-label="Room code" inputMode="numeric"
              autoCapitalize="characters" autoComplete="off" spellCheck={false} onKeyDown={(e) => e.stopPropagation()} />
            <button type="submit" className={`${styles.key} ${styles.green}`} disabled={!!busy}><GIcon name="enter" /><span>{busy === "join" ? "Joining…" : "Join"}</span></button>
          </form>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="button" className={styles.textButton} onClick={onBack}><GIcon name="back" />Back</button>
      </div>
    </div>
  );
}

type Driver = { id: number; name: string; car: Choice };
/** Everyone in the room, you first-come order (ids are given in the order people join). */
function drivers(me: Choice): Driver[] {
  return [{ id: net.id, name: net.name, car: me }, ...net.roster].sort((a, b) => a.id - b.id);
}
const hostName = (P: Party, me: Choice) => drivers(me).find((d) => d.id === P.host)?.name ?? "the host";

/** The room's link and a message to send it with. */
function invite(P: Party) {
  const url = `${location.origin}/?code=${P.code}`;
  return { url, text: `Race me up the Thamarassery Churam! 🏁 Join my room ${showCode(P.code)}` };
}

/** The room's lobby. Re-rendered by the HUD whenever the room changes (lib/net `version`). */
export function RoomCard({ me, onLeave }: { me: Choice; onLeave: () => void }) {
  const P = net.party, [copied, setCopied] = useState(false);
  if (!P) return null;
  const list = drivers(me), host = P.host === net.id, slots = Math.min(PRIVATE_CAP, Math.max(4, list.length + 1));
  const racing = P.phase === "countdown" || P.phase === "race" || P.phase === "results";
  const share = async () => {
    const { url, text } = invite(P), nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: "Drive Wayanad", text, url }); return; } catch (e) { if ((e as DOMException).name === "AbortError") return; } }
    copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(invite(P).url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };
  return (
    <div className={styles.veil}>
      <div className={`${styles.card} ${styles.room}`} role="dialog" aria-label={`Room ${showCode(P.code)}`}>
        <header className={styles.ribbon}><GIcon name="flag" /><span>Your room</span><em>{list.length}/{PRIVATE_CAP}</em></header>

        <div className={styles.ticket}>
          <small>Room code</small>
          <b>{showCode(P.code)}</b>
          <div className={styles.shareRow}>
            <button type="button" className={`${styles.key} ${styles.green}`} onClick={() => void copy()}><GIcon name="copy" /><span>{copied ? "Copied!" : "Copy link"}</span></button>
          </div>
        </div>

        <ul className={styles.slots} aria-label="Drivers">
          {Array.from({ length: slots }, (_, i) => {
            const d = list[i];
            if (!d) return <li key={`e${i}`} data-empty><button type="button" onClick={() => void share()}><GIcon name="plus" /><span>Invite</span></button></li>;
            return (
              <li key={d.id} data-me={d.id === net.id || undefined}>
                <span className={styles.paint} style={{ background: colourOf(d.car.colour).hex }} data-light={["white", "silver", "yellow"].includes(d.car.colour) || undefined}><GIcon name="car" /></span>
                <span className={styles.who}><b>{d.name}</b><small>{carOf(d.car.car).name}</small></span>
                {d.id === P.host && <span className={styles.crown} title="Host"><GIcon name="crown" /></span>}
                {d.id === net.id && <em className={styles.you}>You</em>}
              </li>
            );
          })}
        </ul>

        <VoicePanel />

        {racing ? (
          <div className={styles.status}>
            <b>Race in progress</b>
            <span>{P.racers.length} driving · you&apos;ll race in the next round</span>
            {host && <button type="button" className={`${styles.key} ${styles.red}`} onClick={partyLobby}><span>End race for everyone</span></button>}
          </div>
        ) : (<>
          <div className={styles.modeRow} role="radiogroup" aria-label="Mode">
            {(["race", "free"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={P.mode === m} disabled={!host} onClick={() => partyMode(m)}>
                <GIcon name={m === "race" ? "flag" : "car"} />
                <span><b>{m === "race" ? "Race" : "Free drive"}</b><small>{m === "race" ? "3·2·1 GO, first to Lakkidi wins" : "Drive together, no clock"}</small></span>
              </button>
            ))}
          </div>
          {host ? (
            <button type="button" className={`${styles.key} ${styles.gold} ${styles.big} ${styles.startKey}`} onClick={partyStart} autoFocus>
              <GIcon name="play" /><span>{P.mode === "race" ? "Start race" : "Start driving"}</span>
              {list.length < 2 && <small>waiting for friends? you can start anyway</small>}
            </button>
          ) : (
            <p className={styles.waiting}>Waiting for <b>{hostName(P, me)}</b> to start<i /><i /><i /></p>
          )}
        </>)}
        {net.status !== "live" && <p className={styles.error}>Reconnecting…</p>}
        <button type="button" className={styles.textButton} onClick={() => { leaveVoice(); leaveRoom(true); onLeave(); }}><GIcon name="leave" />Leave room</button>
      </div>
    </div>
  );
}

const MEDAL = ["gold", "silver", "bronze"] as const;
/** A race's results at the gate: who got there in what order, and who's still driving. */
export function Podium({ me }: { me: Choice }) {
  const P = net.party, [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, []);
  if (!P || P.mode !== "race") return null;
  const names = new Map(drivers(me).map((d) => [d.id, d.name])), done = new Set(P.results.map((r) => r.id));
  const still = P.racers.filter((id) => !done.has(id)), left = P.closeAt ? Math.max(0, Math.ceil((P.closeAt - performance.now()) / 1000)) : 0;
  return (
    <div className={styles.podium}>
      <header><GIcon name="flag" /><span>Race results</span>{P.phase === "race" && left > 0 && <em>closes in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</em>}</header>
      <ol>
        {P.results.map((r, i) => (
          <li key={`${r.id}-${i}`} data-medal={MEDAL[i]} data-me={r.id === net.id || undefined}>
            <i>{i + 1}</i><b>{r.id === net.id ? "You" : r.name}</b><span>{clock(r.time ?? 0)}</span><em>{(r.points ?? 0).toLocaleString("en-IN")} pts</em>
          </li>
        ))}
        {still.map((id) => (
          <li key={id} data-still>
            <i>·</i><b>{names.get(id) ?? "Driver"}</b><span>{P.phase === "race" ? "still driving…" : "didn't finish"}</span><em />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Re-render while the voice state changes (lib/voice bumps `version`). */
function useVoice() {
  const [, set] = useState(0);
  useEffect(() => { let v = -1; const t = setInterval(() => { if (voice.version !== v) { v = voice.version; set(v); } }, 150); return () => clearInterval(t); }, []);
  return voice;
}
const nameOf = (id: number) => (id === net.id ? "You" : net.roster.find((p) => p.id === id)?.name ?? "Driver");

/** Voice chat in the room's lobby: join, hold-to-talk or open mic, an effect, who's on (tap to mute). */
function VoicePanel() {
  const v = useVoice(), ids = net.voiceIds, others = ids.filter((id) => id !== net.id);
  return (
    <section className={styles.voice} aria-label="Voice chat">
      <header><GIcon name="mic" /><b>Voice chat</b><em>{ids.length}/4</em></header>
      {!v.on ? (<>
        <p>Talk to your friends while you drive. Up to 4. Straight between phones, nothing recorded.</p>
        <button type="button" className={`${styles.key} ${styles.green}`} disabled={v.joining || ids.length >= 4} onClick={() => void joinVoice()}>
          <GIcon name="mic" /><span>{v.joining ? "Starting the mic…" : ids.length >= 4 ? "Voice is full" : "Join voice"}</span>
        </button>
      </>) : (<>
        <div className={styles.micMode} role="radiogroup" aria-label="Microphone">
          <button type="button" role="radio" aria-checked={!v.open} onClick={() => setOpenMic(false)}>Hold to talk</button>
          <button type="button" role="radio" aria-checked={v.open} onClick={() => setOpenMic(true)}>Open mic</button>
        </div>
        <div className={styles.fx} role="radiogroup" aria-label="Voice effect">
          {VOICE_FX.map((f) => <button key={f.id} type="button" role="radio" aria-checked={v.fx === f.id} onClick={() => setVoiceFx(f.id)}><span>{f.icon}</span><small>{f.name}</small></button>)}
        </div>
        <div className={styles.talkers}>
          <span data-talking={v.meTalking || undefined}><GIcon name="mic" />You</span>
          {others.map((id) => {
            const p = v.peers.get(id), muted = v.muted.has(id);
            return (
              <button key={id} type="button" data-talking={(p?.talking && !muted) || undefined} data-muted={muted || undefined} data-failed={p?.state === "failed" || undefined}
                onClick={() => toggleMute(id)} title={muted ? "Unmute" : "Mute"}>
                <GIcon name={muted ? "micOff" : "mic"} />{nameOf(id)}{p?.state === "failed" ? " · can't connect" : !p || p.state === "connecting" ? " · …" : ""}
              </button>
            );
          })}
        </div>
        <div className={styles.voiceRow}>
          {!v.open && <button type="button" className={`${styles.key} ${styles.gold}`} {...pressHold()}><GIcon name="mic" /><span>Hold to talk</span></button>}
          <button type="button" className={styles.textButton} onClick={leaveVoice}><GIcon name="leave" />Leave voice</button>
        </div>
      </>)}
      {v.error && <p className={styles.error}>{v.error}</p>}
      {v.full && <p className={styles.error}>Voice is full (4 talking).</p>}
    </section>
  );
}

/** Hold-to-talk handlers for a key. */
function pressHold() {
  return {
    onPointerDown: (e: React.PointerEvent) => { try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {} holdTalk(true); },
    onPointerUp: () => holdTalk(false), onPointerCancel: () => holdTalk(false), onPointerLeave: () => holdTalk(false),
  };
}

/** On the road, while on voice: the talk key (hold; with an open mic it mutes) and who's talking. */
export function VoiceHud() {
  const v = useVoice();
  if (!v.on) return null;
  const talking = [...v.peers].filter(([id, p]) => p.talking && !v.muted.has(id)).map(([id]) => nameOf(id));
  const live = v.open ? !v.holding : v.holding;
  return (<>
    {talking.length > 0 && <div className={styles.talkingNow} aria-live="polite">{talking.map((n) => <span key={n}>🔊 {n}</span>)}</div>}
    <button type="button" className={styles.talkKey} data-live={live || undefined} data-speaking={v.meTalking || undefined} {...pressHold()}
      aria-label={v.open ? "Hold to mute" : "Hold to talk"} title={v.open ? "Hold to mute (V)" : "Hold to talk (V)"}>
      <GIcon name={live ? "mic" : "micOff"} /><small>{v.open ? (v.holding ? "Muted" : "Mic on") : v.holding ? "Talking" : "Hold"}</small><kbd>V</kbd>
    </button>
  </>);
}
