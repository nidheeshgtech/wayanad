"use client";
import { useEffect, useSyncExternalStore } from "react";
import { MISSION, bumpMission, loadBest, mission, pressScoop, requestLandslide, rocksLeft, starsFor, subscribeMission } from "@/lib/mission";
import { setBorrow } from "@/lib/choice";
import { game } from "@/lib/game";
import { mark } from "@/lib/stats";
import styles from "./Mission.module.scss";

/* The landslide rescue's screens (lib/mission, components/scene/Landslide): the start screen's button, the job's
 * panel while you work (rocks left, the clock, SCOOP / DUMP — E on a keyboard), and the card when the road opens. */
const useMission = () => useSyncExternalStore(subscribeMission, () => mission.v, () => 0);
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** On the start screen: start the drive straight into the rescue. */
export function MissionButton({ onGo }: { onGo: () => void }) {
  return (
    <button type="button" className={styles.start} onClick={() => { requestLandslide(); mark("landslide"); onGo(); }} onKeyDown={(e) => e.stopPropagation()}>
      <span aria-hidden>🚜</span> Landslide rescue
    </button>
  );
}

export function MissionHud() {
  useMission();
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.key === "e" || e.key === "E") && mission.phase === "work" && !e.repeat) pressScoop(); };
    addEventListener("keydown", key); return () => removeEventListener("keydown", key);
  }, []);
  // the clock ticks on screen without React state each frame: a light re-render 4× a second while working
  useEffect(() => { if (mission.phase !== "work") return; const id = setInterval(bumpMission, 250); return () => clearInterval(id); }, [mission.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  if (mission.phase === "work") {
    const left = rocksLeft(), label = mission.canScoop ? "🪣 Scoop" : mission.canDump ? "⬇️ Dump" : null;
    const tip = mission.carried >= 0 ? (mission.canDump ? "Tip it over the edge!" : "Drive to the road's edge") : mission.canScoop ? "Scoop it up!" : "Drive the bucket up to a rock";
    return (
      <>
        <div className={styles.panel} role="status" aria-live="polite">
          <b>🚜 Landslide rescue</b>
          <span>🪨 {left} {left === 1 ? "rock" : "rocks"} left · <Clock /></span>
          <small>{tip}</small>
        </div>
        <button type="button" className={styles.action} disabled={!label} onPointerDown={(e) => { e.preventDefault(); pressScoop(); }} aria-label={label ?? "Scoop or dump"}>
          {label ?? "🪣"}<small>E</small>
        </button>
      </>
    );
  }
  if (mission.phase === "done") {
    const sec = mission.t, stars = starsFor(sec), best = loadBest();
    return (
      <div className={styles.done} role="dialog" aria-label="Road open">
        <span className={styles.stars} aria-label={`${stars} of 3 stars`}>{[0, 1, 2].map((i) => <i key={i} data-on={i < stars || undefined}>★</i>)}</span>
        <b>Road open!</b>
        <p>You cleared the landslide in <em>{clock(sec)}</em>{best ? <> · best {clock(best)}</> : null}</p>
        <small>{stars < 3 ? `Under ${clock(MISSION.stars[stars === 1 ? 1 : 0])} for ${stars === 1 ? "2" : "3"} stars` : "The traffic is moving again. Thank you! 🙏"}</small>
        <div>
          <button type="button" onClick={() => requestLandslide()}>Play again</button>
          <button type="button" data-go onClick={() => { mission.phase = "none"; bumpMission(); setBorrow(null); game.parked = null; }}>Drive on</button>
        </div>
      </div>
    );
  }
  return null;
}

function Clock() {
  useMission();
  return <>⏱ {clock(mission.t)}</>;
}
