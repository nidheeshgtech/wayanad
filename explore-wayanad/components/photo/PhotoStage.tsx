"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import PHOTOS from "@/data/photos.json";
import { STORY, type Mark, type Shot } from "@/data/story";
import { ACTS, PALETTE, type ActId } from "@/data/acts";
import { scrollState } from "@/lib/scrollState";
import { churamMood, smoothstep } from "@/lib/mood";
import { loadRouteMarks } from "@/lib/route";
import styles from "./PhotoStage.module.scss";

const FADE = 0.035; // act progress either side of a cut over which two shots crossfade
const LOOKAHEAD = 0.35; // start loading a shot this much act progress before it appears
const ORDER = ACTS.map((a) => a.id);
const CREDIT = Object.fromEntries(PHOTOS.map((p) => [p.id, p]));
const SLOTS: { act: ActId; shot: Shot }[] = ORDER.flatMap((act) => (STORY[act] ?? []).map((shot) => ({ act, shot })));
const srcset = (id: string) => `/photos/${id}-960.jpg 960w, /photos/${id}-1280.jpg 1280w`;

/**
 * The visual layer until real footage exists: real photographs of each place, cross-faded at the storyboard's beats
 * and drifted by scroll (a slow push or pan), with fog over the churam keyed to the hairpins.
 * Reads scrollState on GSAP's ticker and writes styles directly — no React state per frame.
 */
export default function PhotoStage() {
  const imgs = useRef<(HTMLImageElement | null)[]>([]);
  const fog = useRef<HTMLDivElement>(null), credit = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let arch = 0.905; // procedural default; replaced by the OSM road below
    loadRouteMarks().then((m) => { scrollState.bends = m.bends; arch = m.arch; }).catch(() => {});
    // marks are road t; the counter and the 3D camera both run t = progress × 0.98
    const resolve = (m: Mark) => (typeof m === "number" ? m : (m === "arch" ? arch : scrollState.bends[Number(m.slice(4)) - 1]) / 0.98);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let shown = "";

    const tick = () => {
      const { act, progress: p } = scrollState, ai = ORDER.indexOf(act);
      let lead = -1, leadOpacity = 0;
      SLOTS.forEach(({ act: slotAct, shot }, i) => {
        const el = imgs.current[i];
        if (!el) return;
        const a = resolve(shot.from), b = resolve(shot.to), si = ORDER.indexOf(slotAct);
        if (!el.srcset && ((si === ai && p >= a - LOOKAHEAD) || (si === ai + 1 && a === 0 && p > 1 - LOOKAHEAD))) {
          el.sizes = "100vw";
          el.srcset = srcset(shot.photo);
          el.src = `/photos/${shot.photo}-960.jpg`;
        }
        let opacity = 0;
        if (slotAct === act) {
          const fadeIn = a <= 0 ? 1 : smoothstep(p, a - FADE, a + FADE), fadeOut = b >= 1 ? 1 : 1 - smoothstep(p, b - FADE, b + FADE);
          opacity = Math.min(fadeIn, fadeOut);
        }
        el.style.opacity = String(opacity);
        if (opacity > 0) {
          const k = still ? 0 : smoothstep(p, a, b), [[s0, x0, y0], [s1, x1, y1]] = shot.move;
          const s = still ? 1 : s0 + (s1 - s0) * k, slack = ((s - 1) / 2) * 100;
          el.style.transform = `translate3d(${(x0 + (x1 - x0) * k) * slack}%, ${(y0 + (y1 - y0) * k) * slack}%, 0) scale(${s})`;
        }
        if (opacity > leadOpacity) { lead = i; leadOpacity = opacity; }
      });

      const id = lead >= 0 ? SLOTS[lead].shot.photo : "";
      if (id !== shown && credit.current) {
        shown = id;
        const c = CREDIT[id];
        credit.current.textContent = c ? `${c.place} · photo ${c.author}, ${c.license}` : "";
        credit.current.href = c?.source ?? "#";
        credit.current.style.visibility = c ? "visible" : "hidden";
      }
      if (fog.current) {
        const level = act === "churam" ? smoothstep(churamMood(p * 0.98, scrollState.bends).fog, 0.02, 0.11) * 0.85 : PALETTE[act].mist * 0.6;
        fog.current.style.opacity = String(level);
      }
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, []);

  return (
    <>
    <div className={styles.stage} aria-hidden>
      {SLOTS.map(({ shot }, i) => (
        <img
          key={i}
          ref={(el) => { imgs.current[i] = el; }}
          className={styles.photo}
          alt=""
          decoding="async"
          // the opening shot is in the HTML so it can be the page's largest paint; the rest get their source (and sizes,
          // which alone would make React preload an empty URL) just ahead of their beat
          // (src too: React turns this image into a Link preload header and takes its URL from src)
          {...(i === 0 ? { src: `/photos/${shot.photo}-1280.jpg`, srcSet: srcset(shot.photo), sizes: "100vw" } : {})}
        />
      ))}
      <div ref={fog} className={styles.fog}><span /><span /></div>
      <div className={styles.scrim} />
    </div>
    {/* outside the stage: the stage sits under the copy and is hidden from assistive tech; the credit must be readable and clickable */}
    <a ref={credit} className={styles.credit} target="_blank" rel="noopener noreferrer" />
    </>
  );
}
