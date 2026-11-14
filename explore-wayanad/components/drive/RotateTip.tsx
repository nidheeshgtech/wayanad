"use client";
import { useEffect, useState } from "react";
import { game } from "@/lib/game";
import { platform } from "@/lib/native";
import styles from "./Drive.module.scss";

/**
 * On a phone held upright in the browser: once the drive has started, a quiet word that sideways shows more of the
 * road. Once a visit, gone after a few seconds or as soon as the phone turns. (The apps are landscape only; the site
 * stays both ways — most visitors arrive from Instagram holding the phone upright, and shouldn't be stopped at a
 * "turn your phone" wall.)
 */
const SHOW_FOR = 7000;
export default function RotateTip() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (platform() !== "web" || !matchMedia("(pointer: coarse)").matches) return;
    try { if (sessionStorage.getItem("wayanad-rotate-tip")) return; } catch {}
    const upright = matchMedia("(orientation: portrait)");
    let shown = false, hide = 0, poll = 0;
    const done = () => { setOn(false); clearTimeout(hide); };
    poll = window.setInterval(() => {
      if (shown || !game.started || game.paused || game.foot.on || !upright.matches) return;
      shown = true; setOn(true); clearInterval(poll);
      try { sessionStorage.setItem("wayanad-rotate-tip", "1"); } catch {}
      hide = window.setTimeout(done, SHOW_FOR);
    }, 1000);
    const turned = () => { if (!upright.matches) done(); };
    upright.addEventListener("change", turned);
    return () => { clearInterval(poll); clearTimeout(hide); upright.removeEventListener("change", turned); };
  }, []);
  return (
    <div className={styles.rotateTip} data-on={on || undefined} role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" aria-hidden><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M3 12a9 9 0 0 1 4-7.5M21 12a9 9 0 0 1-4 7.5" /><path d="M5.5 3.5 7 4.5 6 6M18.5 20.5 17 19.5 18 18" /></svg>
      <span>Turn your phone sideways for a wider view of the road</span>
    </div>
  );
}
