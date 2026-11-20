"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ANIMALS, animal } from "@/data/animals";
import { clearFresh, collected, stickers, subscribeStickers } from "@/lib/stickers";
import styles from "./Stickers.module.scss";

/* The animal sticker book (lib/stickers, data/animals): a button that opens the book, the sticker that slaps onto the
 * screen when you find a new animal, and the "honk!" hint while one you haven't got is in view. */
const useStickers = () => useSyncExternalStore(subscribeStickers, () => stickers.v, () => 0);
const OPEN = ANIMALS.filter((a) => !a.soon).length;

/** "🐾 Stickers 3/6": opens the book. */
export function StickerButton({ className }: { className?: string }) {
  useStickers();
  const [open, setOpen] = useState(false), have = collected().filter((id) => !animal(id).soon).length;
  return (
    <>
      <button type="button" className={className ?? styles.open} onClick={() => setOpen(true)} onKeyDown={(e) => e.stopPropagation()}>
        <span aria-hidden>🐾</span> Animal stickers <b>{have}/{OPEN}</b>
      </button>
      {open && <StickerBook onClose={() => setOpen(false)} />}
    </>
  );
}

function StickerBook({ onClose }: { onClose: () => void }) {
  useStickers();
  const have = collected();
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    addEventListener("keydown", key, true); return () => removeEventListener("keydown", key, true);
  }, [onClose]);
  return (
    <div className={styles.book} role="dialog" aria-modal aria-label="Animal sticker book" onClick={onClose} onKeyDown={(e) => e.stopPropagation()}>
      <div className={styles.page} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Animal sticker book</h2>
          <p>Spot an animal by the road and <b>honk 📯</b> to get its sticker.</p>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">✕</button>
        </header>
        <ul>
          {ANIMALS.map((a) => {
            const got = have.includes(a.id);
            return (
              <li key={a.id} data-got={got || undefined} data-soon={a.soon || undefined}>
                <div className={styles.art}><img src={a.img} alt={got ? a.name : ""} loading="lazy" />{!got && <span aria-hidden>?</span>}</div>
                <b>{got ? a.name : a.soon ? "Coming soon" : "???"}</b>
                {got && <i lang="ml">{a.ml}</i>}
                <small>{got ? a.fact : a.where}</small>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** A new sticker: it slaps onto the screen with its name, then flies off. */
export function StickerPop() {
  useStickers();
  const id = stickers.fresh;
  useEffect(() => { if (!id) return; const t = setTimeout(clearFresh, 3200); return () => clearTimeout(t); }, [id, stickers.freshAt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!id) return null;
  const a = animal(id), left = OPEN - collected().filter((x) => !animal(x).soon).length;
  return (
    <div className={styles.pop} key={stickers.freshAt} role="status" aria-live="polite">
      <div className={styles.sticker}><img src={a.img} alt="" /></div>
      <b>New sticker!</b>
      <span>{a.name} · <i lang="ml">{a.ml}</i></span>
      <small>{left > 0 ? `${left} more to find` : "You found them all on this road! 🎉"}</small>
    </div>
  );
}

/** "Animal nearby! Honk 📯" while one you haven't got is in view. */
export function AnimalHint() {
  useStickers();
  if (!stickers.hint || stickers.fresh) return null;
  return <div className={styles.hint} role="status" aria-live="polite"><span aria-hidden>🐾</span> Animal nearby! <b>Honk 📯</b></div>;
}
