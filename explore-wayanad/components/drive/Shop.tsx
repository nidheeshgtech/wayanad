"use client";
import { useEffect, useState } from "react";
import { SHOP, buy, owns, shop, use, useShop } from "@/lib/shop";
import { horn, honk } from "@/lib/horn";
import { wallet } from "@/lib/jobs";
import { game, togglePause } from "@/lib/game";
import styles from "./Shop.module.scss";

/* The ₹ shop (lib/shop), "Kada": extras for the rupees you've earned. The drive holds still while it's open. */
export default function Shop({ onClose }: { onClose: () => void }) {
  useShop();
  const [, bump] = useState(0);
  const [note, setNote] = useState("");
  const rupees = wallet();
  useEffect(() => {
    const was = game.paused; if (!was) togglePause(true);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); if (!was) togglePause(false); };
  }, [onClose]);

  const act = (id: string) => {
    const item = SHOP.find((i) => i.id === id)!;
    if (!owns(id)) {
      if (!buy(id)) { setNote(`₹${item.price - rupees} kuravaanu. Oru Churam Job cheythu varoo!`); return; }
      setNote(`${item.name}: vaangi! 🎉`);
    } else use(id);
    if (item.horn) honk({ audible: true, preview: true, kind: item.horn });
    bump((n) => n + 1);
  };

  return (
    <div className={styles.veil} role="dialog" aria-modal aria-label="Kada: the rupee shop" onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <header>
          <div><p>Kada</p><h2>Extras for your car</h2></div>
          <b className={styles.wallet}><i>₹</i>{rupees.toLocaleString("en-IN")}</b>
        </header>
        <ul>
          {SHOP.map((it) => {
            const mine = owns(it.id), on = it.kind === "glow" ? shop.glow === it.id : horn.kind === it.horn;
            return (
              <li key={it.id} data-on={on || undefined}>
                <span className={styles.swatch} style={{ ["--c" as string]: it.hex }} data-kind={it.kind}>{it.kind === "horn" ? (it.horn === "chenda" ? "🥁" : "🎹") : ""}</span>
                <div><b>{it.name}</b><small>{it.blurb}</small></div>
                <button type="button" onClick={() => act(it.id)} data-buy={!mine || undefined} disabled={!mine && rupees < it.price}>
                  {!mine ? `₹${it.price}` : on ? (it.kind === "glow" ? "Off" : "On ✓") : "Use"}
                </button>
              </li>
            );
          })}
        </ul>
        <footer><span>{note || "Rupees come from Churam Jobs past the Lakkidi gate, and from getting away from the police."}</span><button type="button" onClick={onClose}>Close</button></footer>
      </div>
    </div>
  );
}
