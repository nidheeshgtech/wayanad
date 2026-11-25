"use client";
import { useEffect, useState } from "react";
import { PAINTS, STATIONS, respray, town } from "@/lib/townLife";
import { wallet } from "@/lib/jobs";
import { game, togglePause } from "@/lib/game";
import styles from "./Shop.module.scss";

/* The paint garage's card (lib/townLife): stopped in its bay, pick a colour for this drive. The drive holds still while
 * it's open. Shares the Kada's look (Shop.module.scss). */
export default function PaintCard() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { const id = setInterval(() => setOpen(town.painting), 200); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!open) return;
    const was = game.paused; if (!was) togglePause(true);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); if (!was) togglePause(false); };
  }, [open]);
  if (!open) return null;
  const st = STATIONS.find((x) => x.kind === "paint")!, rupees = wallet();
  function close() { town.painting = false; setOpen(false); setNote(""); }
  const pick = (hex: string) => { if (respray(hex)) close(); else setNote(`₹${st.price - rupees} kuravaanu. Oru Churam Job cheythu varoo!`); };
  return (
    <div className={styles.veil} role="dialog" aria-modal aria-label={st.name} onClick={close}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <header>
          <div><p>🎨 {st.name} · {st.town}</p><h2>A new colour, ₹{st.price}</h2></div>
          <b className={styles.wallet}><i>₹</i>{rupees.toLocaleString("en-IN")}</b>
        </header>
        <ul>
          {PAINTS.map((c) => (
            <li key={c.hex} data-on={town.paint === c.hex || undefined}>
              <i className={styles.swatch} style={{ ["--c" as string]: c.hex }} aria-hidden />
              <div><b>{c.name}</b><small>For this drive</small></div>
              <button type="button" data-buy onClick={() => pick(c.hex)} disabled={rupees < st.price}>₹{st.price}</button>
            </li>
          ))}
        </ul>
        <footer><span>{note || "Chettan sprays it while you have a chaya."}</span><button type="button" onClick={close}>Close</button></footer>
      </div>
    </div>
  );
}
