"use client";
import { useState } from "react";
import styles from "./Preroll.module.scss";

/** Not scroll-driven: three stamps, then the first scroll starts the climb. Also covers the scene's first frames. */
export default function Preroll() {
  const [state, setState] = useState<"idle" | "go" | "done">("idle");
  if (state === "done") return null;
  return (
    <div className={`${styles.preroll} ${state === "go" ? styles.go : ""}`}>
      <div className={styles.hint}>Explore Wayanad</div>
      <div className={styles.stamps}><span>Adivaram</span><span>14 kilometres</span><span>Nine bends</span></div>
      <button type="button" onClick={() => { setState("go"); setTimeout(() => setState("done"), matchMedia("(prefers-reduced-motion: reduce)").matches ? 100 : 3200); }}>Start the climb</button>
      <div className={styles.hint}>Scroll to drive. Sound is off until you turn it on.</div>
      <a className={styles.drive} href="/drive">Or drive the bus yourself →</a>
    </div>
  );
}
