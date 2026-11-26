"use client";
import { useEffect, useState } from "react";
import { live, weatherWords } from "@/lib/live";
import { clock } from "@/lib/share";
import styles from "./LiveStrip.module.scss";

/** "Wayanad live" on the start screen (lib/live): the real weather in Kalpetta now, how many are driving, today's
 * totals and the fastest climb. Nothing until the first answer comes; it refreshes with each one. */
export default function LiveStrip() {
  const [, setV] = useState(0);
  useEffect(() => { let last = -1; const t = setInterval(() => { if (live.v !== last) { last = live.v; setV(live.v); } }, 1000); return () => clearInterval(t); }, []);
  if (!live.ok) return null;
  const w = weatherWords(), t = live.today;
  return (
    <div className={styles.strip} aria-label="Wayanad live">
      <p className={styles.head}><i aria-hidden /> Wayanad live</p>
      <ul className={styles.list}>
        {w && <li><b>{w.en}</b><span>in Kalpetta now</span></li>}
        <li><b>{live.online.toLocaleString("en-IN")}</b><span>{live.online === 1 ? "driving now (you)" : "driving now"}</span></li>
        {t.km > 0 && <li><b>{t.km.toLocaleString("en-IN")} km</b><span>driven today · {t.chaya.toLocaleString("en-IN")} {t.chaya === 1 ? "chaya" : "chayas"} · {t.jobs.toLocaleString("en-IN")} {t.jobs === 1 ? "job" : "jobs"}</span></li>}
        {live.top && <li><b>{clock(live.top.sec)}</b><span>today&apos;s fastest climb · {live.top.name}</span></li>}
      </ul>
    </div>
  );
}
