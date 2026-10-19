"use client";
import { createContext, useContext, useMemo, useRef } from "react";
import styles from "./Hud.module.scss";
import Sound from "./Sound";

type HudApi = { setCounter: (n: number) => void; setScene: (s: string) => void; setStatus: (s: string) => void; setGrade: (c: string | null) => void };
const Ctx = createContext<HudApi | null>(null);
export const useHud = () => { const c = useContext(Ctx); if (!c) throw new Error("useHud outside <Hud>"); return c; };

/** Fixed chrome: brand, status chip, hairpin counter, scene label, per-act grade, sound. Updated imperatively to avoid re-renders during scrub. */
export default function Hud({ children }: { children: React.ReactNode }) {
  const counter = useRef<HTMLElement>(null), scene = useRef<HTMLDivElement>(null), status = useRef<HTMLDivElement>(null), grade = useRef<HTMLDivElement>(null);
  const api = useMemo<HudApi>(() => ({
    setCounter: (n) => { if (counter.current) counter.current.textContent = String(n); },
    setScene: (s) => { if (scene.current) scene.current.textContent = s; },
    setStatus: (s) => { if (status.current) status.current.textContent = s; },
    setGrade: (c) => { if (grade.current) { grade.current.style.background = c ?? "transparent"; grade.current.style.opacity = c ? "0.35" : "0"; } },
  }), []);
  return (
    <Ctx.Provider value={api}>
      <div ref={grade} className={styles.grade} aria-hidden />
      <div className={styles.hud} aria-hidden>
        <div><div className={styles.brand}>Explore Wayanad</div><div ref={status} className={styles.status}>Ghat open today</div></div>
        <div className={styles.counter}><b ref={counter}>0</b><span> / 9</span><small>hairpin</small></div>
      </div>
      <div ref={scene} className={styles.scene} aria-hidden>Adivaram</div>
      <div className={styles.grain} aria-hidden /><div className={styles.vignette} aria-hidden />
      <Sound />
      {children}
    </Ctx.Provider>
  );
}
