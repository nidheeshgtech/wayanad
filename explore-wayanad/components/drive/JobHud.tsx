"use client";
import { useEffect, useRef } from "react";
import { STOP, allowed, cancelJob, jobs, jobsOn, wallet } from "@/lib/jobs";
import { game } from "@/lib/game";
import { score } from "@/lib/score";
import type { Job } from "@/data/jobs";
import styles from "./JobHud.module.scss";

/* Churam Jobs on screen (lib/jobs): the word as you come up to a job's circle; the job's card when it starts (who, what,
 * where, the clock, the pay); the objective strip while you're on it, with a ✕ to give it up; and the card at its end.
 * Plus the wallet, in rupees, under the score. All written straight to the DOM from one rAF loop. */
const INTRO = 7000, RESULT = 6500; // ms on screen

const km = (units: number) => { const m = Math.max(0, units * 10); return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; };
const mmss = (s: number) => { const t = Math.max(0, Math.ceil(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function Face({ job, big }: { job: Job | null; big?: boolean }) {
  return <i className={styles.face} data-big={big || undefined} style={{ ["--tint" as string]: job?.tint ?? "#d9a441" }}>{job?.initials ?? ""}</i>;
}

export default function JobHud() {
  const prompt = useRef<HTMLDivElement>(null), intro = useRef<HTMLDivElement>(null), strip = useRef<HTMLDivElement>(null), result = useRef<HTMLDivElement>(null);
  const shown = useRef({ prompt: "", intro: "", result: 0, strip: "" });

  useEffect(() => {
    let raf = 0;
    const set = (root: HTMLElement | null, sel: string, text: string) => { const el = root?.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
    const face = (root: HTMLElement | null, j: Job) => { const el = root?.querySelector<HTMLElement>("i"); if (el) { el.textContent = j.initials; el.style.setProperty("--tint", j.tint); } };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const on = jobsOn(), now = performance.now(), S = shown.current, a = jobs.active;
      // the word as you come up to a circle
      const near = on && !a ? jobs.near : null;
      const pText = near ? (Math.abs(game.s - near.pick) < STOP.reach ? (Math.abs(game.speed) < 0.04 ? `${near.who}: "Nikku, nikku…"` : `Circle-il nirthu: ${near.who}kku oru pani undu`) : `${near.who}kku oru pani undu · ${km(near.pick - game.s)}`) : "";
      if (pText !== S.prompt && prompt.current) {
        S.prompt = pText; prompt.current.toggleAttribute("data-on", !!pText);
        if (near) { face(prompt.current, near); set(prompt.current, "span", pText); }
      }
      // the job's card as it starts
      const introOn = on && !!a && now - jobs.intro < INTRO;
      const iKey = introOn ? a!.job.id : "";
      if (iKey !== S.intro && intro.current) {
        S.intro = iKey; intro.current.toggleAttribute("data-on", introOn);
        if (a) {
          const j = a.job;
          face(intro.current, j);
          set(intro.current, "b", j.who); set(intro.current, "small", j.role); set(intro.current, "q", j.offer);
          set(intro.current, "[data-what]", `${j.cargo} → ${j.dropName}`);
          set(intro.current, "[data-terms]", `${km(j.drop - j.pick)} · ${mmss(allowed(j))}${j.crashes !== undefined ? (j.crashes ? ` · idi ${j.crashes} vare maathram` : " · oru idi polum paadilla") : ""} · ${rupees(j.pay)}`);
        }
      }
      // the strip while on the job
      if (strip.current) {
        strip.current.toggleAttribute("data-on", on && !!a);
        if (a) {
          const j = a.job;
          if (S.strip !== j.id) { S.strip = j.id; face(strip.current, j); set(strip.current, "b", `${j.cargo} → ${j.dropName}`); }
          set(strip.current, "[data-left]", km(j.drop - game.s));
          set(strip.current, "[data-clock]", mmss(a.left));
          strip.current.toggleAttribute("data-late", a.left < 30);
          const hits = j.crashes !== undefined ? `· idi ${Math.max(0, score.crashes - a.crashes)}/${j.crashes}` : "";
          set(strip.current, "[data-hits]", hits);
          const here = Math.abs(game.s - j.drop) < STOP.reach;
          set(strip.current, "[data-hint]", here ? (Math.abs(game.speed) < 0.04 ? "Ethi…" : "Ivide nirthu") : "");
        } else S.strip = "";
      }
      // the end of a job
      const r = jobs.result, rOn = !!r && now - r.at < RESULT;
      const rKey = rOn ? r!.at : 0;
      if (rKey !== S.result && result.current) {
        S.result = rKey; result.current.toggleAttribute("data-on", rOn);
        if (r) {
          face(result.current, r.job); result.current.toggleAttribute("data-fail", !r.ok);
          set(result.current, "p", r.title ?? (r.ok ? "Pani kazhinju" : "Pani poyi"));
          set(result.current, "b", r.job.who); set(result.current, "q", r.line);
          set(result.current, "em", r.amount ?? (r.ok ? `+${rupees(r.job.pay)}` : "₹0"));
        }
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div ref={prompt} className={styles.prompt} role="status" aria-live="polite"><Face job={null} /><span /></div>
      <div ref={intro} className={styles.intro} role="status" aria-live="polite">
        <p>Puthiya pani</p>
        <header><Face job={null} big /><div><b /><small /></div></header>
        <q />
        <footer><span data-what /><span data-terms /></footer>
      </div>
      <div ref={strip} className={styles.strip} role="status">
        <Face job={null} />
        <div><b /><span><em data-left /> · <em data-clock /> <em data-hits /> <em data-hint /></span></div>
        <button type="button" onClick={cancelJob} aria-label="Give up this job" title="Pani vendaa">✕</button>
      </div>
      <div ref={result} className={styles.result} role="status" aria-live="polite">
        <p />
        <header><Face job={null} big /><b /></header>
        <q />
        <em />
      </div>
    </>
  );
}

/** The rupees you've earned, kept across climbs: under the score. A little bounce when it goes up. */
export function Wallet() {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, paid = -1, shownN = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const n = wallet(), e = el.current;
      if (!e) return;
      e.toggleAttribute("data-on", n > 0 || jobsOn());
      if (n !== shownN) { shownN = n; const b = e.querySelector("b"); if (b) b.textContent = n.toLocaleString("en-IN"); }
      if (jobs.paid !== paid) { if (paid >= 0) { e.removeAttribute("data-paid"); void e.offsetWidth; e.setAttribute("data-paid", ""); } paid = jobs.paid; }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={el} className={styles.wallet} aria-label="Rupees earned"><i>₹</i><b>0</b></div>;
}
