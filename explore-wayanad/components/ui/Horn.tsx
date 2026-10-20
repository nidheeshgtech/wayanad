"use client";
import { useEffect, useRef } from "react";
import { honk } from "@/lib/horn";
import { scrollState } from "@/lib/scrollState";
import styles from "./Hud.module.scss";

/** The horn, for the stretches with traffic (the churam and on to Kalpetta): button, or H on a keyboard. Asks the
 * vehicle ahead to give way where it's safe (lib/traffic). Shown and hidden through the DOM, not React state. */
export default function Horn() {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const show = () => { const on = scrollState.act === "churam" || scrollState.act === "kalpetta"; if (button.current) button.current.hidden = !on; };
    const timer = setInterval(show, 300); show();
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "h" || e.metaKey || e.ctrlKey || e.altKey || button.current?.hidden) return;
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]")) return;
      honk(); press();
    };
    addEventListener("keydown", key);
    return () => { clearInterval(timer); removeEventListener("keydown", key); };
  }, []);
  const press = () => { const b = button.current; if (!b) return; b.dataset.on = "1"; setTimeout(() => { delete b.dataset.on; }, 400); };
  return <button ref={button} type="button" className={styles.horn} hidden onClick={() => { honk(); press(); }} aria-label="Sound the horn (H)" title="Horn (H)">Horn</button>;
}
