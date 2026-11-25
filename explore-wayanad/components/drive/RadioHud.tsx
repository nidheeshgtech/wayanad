"use client";
import { useEffect, useRef } from "react";
import { nextStation, radio } from "@/lib/radio";
import { game } from "@/lib/game";
import styles from "./RadioHud.module.scss";

/* The radio on screen (lib/radio): the station's name and the song when it changes, the RJ's line between songs, and
 * Q to change station. Written to the DOM from its own frame loop. */
export default function RadioHud() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, shown = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = radio.popup, el = box.current; if (!el) return;
      const live = !!p && performance.now() - p.at < (p.rj ? 7500 : 4200) && game.started && game.phase === "drive";
      el.toggleAttribute("data-on", live);
      if (p && p.at !== shown) {
        shown = p.at; el.toggleAttribute("data-rj", !!p.rj);
        const b = el.querySelector("b"), s = el.querySelector("span"); if (b) b.textContent = p.title; if (s) s.textContent = p.sub;
      }
    };
    tick();
    const key = (e: KeyboardEvent) => {
      if (e.code !== "KeyQ" || e.repeat || (e.target as HTMLElement)?.closest?.("input, textarea")) return;
      if (game.started && game.phase === "drive") nextStation();
    };
    addEventListener("keydown", key);
    return () => { cancelAnimationFrame(raf); removeEventListener("keydown", key); };
  }, []);
  return <div ref={box} className={styles.radio} role="status" aria-live="polite"><b /><span /></div>;
}
