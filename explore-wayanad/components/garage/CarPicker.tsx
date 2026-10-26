"use client";
import dynamic from "next/dynamic";
import { CARS, COLOURS, carOf, colourOf, type Choice } from "@/data/cars";
import styles from "./CarPicker.module.scss";

const CarPreview = dynamic(() => import("./CarPreview"), { ssr: false, loading: () => <div className={styles.loading}>Loading the car…</div> });

/**
 * Pick a car and a paint (data/cars.ts), with the car turning in a small 3D preview. Used on the start screen and in
 * the garage (pause menu). Choosing only changes `value`; the caller decides when to apply it.
 */
export default function CarPicker({ value, onChange }: { value: Choice; onChange: (c: Choice) => void }) {
  const car = carOf(value.car);
  return (
    <div className={styles.picker}>
      <div className={styles.preview}>
        <CarPreview choice={value} />
        <div className={styles.caption}><b>{car.name}</b><span>{colourOf(value.colour).name}</span></div>
      </div>
      <div className={styles.options}>
        <div className={styles.cars} role="radiogroup" aria-label="Car">
          {CARS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={c.id === value.car} onClick={() => onChange({ ...value, car: c.id })}
              onKeyDown={(e) => e.stopPropagation()}>
              <b>{c.name}</b>
            </button>
          ))}
        </div>
        <div className={styles.colours} role="radiogroup" aria-label="Colour">
          {COLOURS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={c.id === value.colour} aria-label={c.name} title={c.name}
              style={{ background: c.hex }} onClick={() => onChange({ ...value, colour: c.id })} onKeyDown={(e) => e.stopPropagation()} />
          ))}
        </div>
      </div>
    </div>
  );
}
