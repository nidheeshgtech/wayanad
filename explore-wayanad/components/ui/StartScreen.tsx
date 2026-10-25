"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { loading, progress } from "@/lib/loading";
import styles from "./StartScreen.module.scss";

/**
 * The title screen both pages open on, laid out like a game's: brand top-left, the chapter's title and three facts
 * bottom-left, a controls panel bottom-right (drive mode), and one button that is the loading bar until the scene is
 * fully ready — models, textures and every shader compiled (lib/loading, components/scene/Warmup) — and only then
 * says Start. So the drive never stalls on its first frames. Enter starts too. The landscape shows through, dimmed,
 * once it's built. `scene: false` (no canvas, e.g. the video tier) is ready at once.
 */
export default function StartScreen({ eyebrow, title, lead, stats, startLabel, onStart, scene = true, panel, footer, leaving = false, presentedBy, beforeStart }: {
  eyebrow: string; title: ReactNode; lead: string; stats: [string, string][];
  startLabel: string; onStart: () => void; scene?: boolean | null;
  panel?: ReactNode; footer?: ReactNode; leaving?: boolean;
  /** the title sponsor, under the brand (data/sponsors.ts PRESENTED_BY) */
  presentedBy?: { name: string; url: string | null } | null;
  /** shown just above the Start button (drive mode's name box) */
  beforeStart?: ReactNode;
}) {
  const [ready, setReady] = useState(false), bar = useRef<HTMLSpanElement>(null), pct = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (scene === false) { setReady(true); return; }
    let raf = 0;
    const tick = () => {
      const p = scene ? progress() : 0.03;
      if (bar.current) bar.current.style.transform = `scaleX(${Math.max(0.03, p)})`;
      if (pct.current) pct.current.textContent = `${Math.round(p * 100)}%`;
      if (scene && loading.ready) { setReady(true); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene]);
  // the page's HUD hides behind the title screen (app/globals.scss) until it leaves
  useEffect(() => {
    if (leaving) return;
    document.documentElement.setAttribute("data-intro", "");
    return () => document.documentElement.removeAttribute("data-intro");
  }, [leaving]);
  useEffect(() => {
    if (!ready || leaving) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); onStart(); } };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [ready, leaving, onStart]);

  return (
    <div className={styles.screen} data-ready={ready || undefined} data-leaving={leaving || undefined} role="dialog" aria-label={eyebrow}>
      <header className={styles.top}>
        <span className={styles.brand}>Explore Wayanad
          {presentedBy && <span className={styles.presented}>Presented by {presentedBy.url ? <a href={presentedBy.url} target="_blank" rel="noopener noreferrer sponsored">{presentedBy.name}</a> : presentedBy.name}</span>}
        </span>
        <span className={styles.status}>{ready ? "Ready" : "Loading"}</span>
      </header>
      <div className={styles.body}>
        <section className={styles.intro}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lead}>{lead}</p>
          <dl className={styles.stats}>
            {stats.map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          {beforeStart}
          <div className={styles.actions}>
            <button type="button" className={styles.start} disabled={!ready} onClick={onStart} autoFocus={ready}>
              {ready ? <><span>{startLabel}</span><kbd aria-hidden>Enter ↵</kbd></> : (
                <><span className={styles.fill} ref={bar} aria-hidden /><span className={styles.loadText}>Loading the road</span><span ref={pct} className={styles.pct}>0%</span></>
              )}
            </button>
            {footer}
          </div>
        </section>
        {panel && <aside className={styles.panel}>{panel}</aside>}
      </div>
    </div>
  );
}

/** A controls panel row: what it does, then its keys or icons. */
export function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.row}><span>{label}</span><span className={styles.keys}>{children}</span></div>;
}
export const panelStyles = styles;
