"use client";
import { useState } from "react";
import { REPORT_WHY, net, reportDriver, setBlocked } from "@/lib/net";
import { CONTACT_EMAIL } from "@/data/site";
import styles from "./Drivers.module.scss";

/**
 * The pause menu's list of the other drivers in your room, each with Report and Block (what the app stores ask of a
 * game where people pick names and talk). Report asks why, then tells the room server, which logs it for us and,
 * when two different drivers report someone, takes their name and voice away at once. Block hides their car, name and
 * voice from you, remembered on this device. Re-rendered by the HUD on every roster change (lib/net `version`).
 */
export default function Drivers({ empty }: { empty: string }) {
  const [asking, setAsking] = useState<number | null>(null), [, redraw] = useState(0);
  const others = net.roster;
  return (
    <section className={styles.drivers} aria-label="Drivers in your room">
      {!others.length ? <p className={styles.empty}>{empty}</p> : (
        <ul>
          {others.map((p) => {
            const blocked = net.blocked.has(p.id), reported = net.reported.has(p.id);
            return (
              <li key={p.id}>
                <div className={styles.row}>
                  <b data-blocked={blocked || undefined}>{blocked ? p.real : p.name}</b>
                  {reported ? <small>Reported</small> : <button type="button" onClick={() => setAsking(asking === p.id ? null : p.id)} aria-expanded={asking === p.id}>Report</button>}
                  <button type="button" aria-pressed={blocked} onClick={() => { setBlocked(p.id, !blocked); redraw((n) => n + 1); }}>{blocked ? "Unblock" : "Block"}</button>
                </div>
                {asking === p.id && (
                  <div className={styles.why} role="group" aria-label={`Report ${p.name}: why?`}>
                    {REPORT_WHY.map((w) => (
                      <button key={w.id} type="button" onClick={() => { reportDriver(p.id, w.id); setBlocked(p.id, true); setAsking(null); }}>{w.label}</button>
                    ))}
                    <small>Reporting also blocks them for you. We read every report.</small>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Links every screen of the game should carry: the privacy policy and how to reach us. */
export function SafetyLinks() {
  return (
    <p className={styles.links}>
      <a href="/privacy" target="_blank" rel="noopener">Privacy</a>
      <a href={`mailto:${CONTACT_EMAIL}?subject=Drive%20Wayanad`}>Contact us</a>
    </p>
  );
}
