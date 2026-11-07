"use client";
import { useEffect, useState } from "react";
import { HORNS, honk, horn, setHornKind, type HornKind } from "@/lib/horn";
import styles from "./HornPicker.module.scss";

/**
 * Pick your horn (lib/horn): a row of five, each played as you choose it. On the start screen under the car, and in the
 * pause menu. The choice is remembered on the device.
 */
export default function HornPicker() {
  // (the saved horn is only known in the browser: start from the default so the server's markup matches)
  const [kind, setKind] = useState<HornKind>("car");
  useEffect(() => setKind(horn.kind), []);
  const choose = (k: HornKind) => { setHornKind(k); setKind(k); honk({ audible: true, preview: true }); };
  return (
    <div className={styles.horns} role="radiogroup" aria-label="Horn">
      {HORNS.map((h) => (
        <button key={h.id} type="button" role="radio" aria-checked={h.id === kind} title={h.name} aria-label={h.name}
          onClick={() => choose(h.id)} onKeyDown={(e) => e.stopPropagation()}>
          <span aria-hidden>{h.icon}</span><small>{h.name}</small>
        </button>
      ))}
    </div>
  );
}
