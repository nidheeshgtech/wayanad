"use client";
import { DRIVERS, driverPortrait, type DriverId } from "@/data/drivers";
import styles from "./DriverPicker.module.scss";

/** Who's driving (data/drivers.ts): a row of portraits, name and role under each. In the car sheet (CarCard) and the
 * desktop picker (CarPicker). Choosing only changes `value`; the caller applies it. */
export default function DriverPicker({ value, onChange }: { value: DriverId; onChange: (d: DriverId) => void }) {
  return (
    <div className={styles.row} role="radiogroup" aria-label="Driver">
      {DRIVERS.map((d) => (
        <button key={d.id} type="button" role="radio" aria-checked={d.id === value} aria-label={`${d.name}, ${d.role}`}
          onClick={() => onChange(d.id)} onKeyDown={(e) => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={driverPortrait(d.id)} alt="" width={64} height={64} loading="lazy" decoding="async" />
          <b>{d.name}</b><small>{d.role}</small>
        </button>
      ))}
    </div>
  );
}

/** A driver's face in a small round frame (the car card, the podium, the room's player list). */
export function DriverFace({ id, size = 28 }: { id: DriverId; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.face} src={driverPortrait(id)} alt="" width={size} height={size} style={{ width: size, height: size }} decoding="async" />;
}
