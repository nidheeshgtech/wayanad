"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CARS, COLOURS, carOf, colourOf, type Choice } from "@/data/cars";
import { setChoice, useChoice } from "@/lib/choice";
import { HORNS, horn, setHornKind, type HornKind } from "@/lib/horn";
import HornPicker from "./HornPicker";
import DriverPicker, { DriverFace } from "./DriverPicker";
import { driverOf } from "@/data/drivers";
import styles from "./CarCard.module.scss";

const CarPreview = dynamic(() => import("./CarPreview"), { ssr: false, loading: () => <span className={styles.wait}>Loading…</span> });

/**
 * The start screen's car on phones: one compact card (the car turning, its name, paint and horn) instead of every car,
 * paint and horn laid out at once. Tapping it opens the car sheet — car, paint, horn, with a big preview — and Apply
 * makes the choice (lib/choice, lib/horn); closing without applying changes nothing. Same cars, paints and horns as the
 * full picker (components/garage/CarPicker, HornPicker), which desktop and the pause menu still use.
 */
export default function CarCard() {
  const choice = useChoice(), [open, setOpen] = useState(false), [kind, setKind] = useState<HornKind>("car");
  useEffect(() => setKind(horn.kind), [open]);
  const car = carOf(choice.car), paint = colourOf(choice.colour), voice = HORNS.find((h) => h.id === kind) ?? HORNS[0];
  const openSheet = () => setOpen(true);
  return (<>
    <div className={styles.card} role="button" tabIndex={0} aria-label={`Your car: ${car.name}, ${paint.name}, ${voice.name} horn, driven by ${driverOf(choice.driver).name}. Customise`}
      onClick={openSheet} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(); } }}>
      <span className={styles.thumb} aria-hidden>{!open && <CarPreview choice={choice} />}</span>
      <span className={styles.info}>
        <small>Your car</small>
        <b>{car.name}</b>
        <span className={styles.meta}><DriverFace id={choice.driver} size={18} />{driverOf(choice.driver).name}<em>·</em>{driverOf(choice.driver).role}</span>
        <span className={styles.meta}><i style={{ background: paint.hex }} />{paint.name}<em>·</em>{voice.icon} horn</span>
      </span>
      <span className={styles.edit} aria-hidden>
        <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>
        <span>Change</span>
      </span>
    </div>
    {open && <CarSheet initial={choice} horn={kind} onClose={() => setOpen(false)} />}
  </>);
}

/** Car, paint and horn together, applied at once. A sheet rising from the bottom on phones, a card on wider screens. */
function CarSheet({ initial, horn: initialHorn, onClose }: { initial: Choice; horn: HornKind; onClose: () => void }) {
  const [draft, setDraft] = useState(initial), [voice, setVoice] = useState(initialHorn);
  const apply = () => { setChoice(draft); setHornKind(voice); onClose(); };
  const car = carOf(draft.car);
  useEffect(() => {
    // Escape closes; nothing else reaches the title screen behind (Enter there starts the drive)
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div className={styles.veil} onClick={onClose} onKeyDown={(e) => e.stopPropagation()}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Your car" onClick={(e) => e.stopPropagation()}>
        <span className={styles.grab} aria-hidden />
        <header className={styles.ribbon}>Your car</header>
        <div className={styles.body}>
          <div className={styles.stage}>
            <CarPreview choice={draft} driver />
            <div className={styles.caption}><b>{car.name}</b><span>{colourOf(draft.colour).name} · {driverOf(draft.driver).name}</span></div>
          </div>
          <section>
            <h3>Driver</h3>
            <DriverPicker value={draft.driver} onChange={(d) => setDraft({ ...draft, driver: d })} />
          </section>
          <section>
            <h3>Car</h3>
            <div className={styles.cars} role="radiogroup" aria-label="Car">
              {CARS.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={c.id === draft.car} onClick={() => setDraft({ ...draft, car: c.id })}>{c.name}</button>
              ))}
            </div>
          </section>
          <section>
            <h3>{car.bike ? "Jacket & helmet" : "Paint"}</h3>
            <div className={styles.paints} role="radiogroup" aria-label="Paint">
              {COLOURS.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={c.id === draft.colour} aria-label={c.name} title={c.name}
                  style={{ background: c.hex }} onClick={() => setDraft({ ...draft, colour: c.id })} />
              ))}
            </div>
          </section>
          <section>
            <h3>Horn <small>tap to hear it</small></h3>
            <HornPicker value={voice} onChange={setVoice} />
          </section>
        </div>
        <footer className={styles.foot}>
          <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.apply} onClick={apply} autoFocus>
            <svg viewBox="0 0 24 24" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg><span>Apply</span>
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
