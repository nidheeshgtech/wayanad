"use client";
import { useRef, useState } from "react";
import { horn } from "@/lib/horn";
import styles from "./Hud.module.scss";

/**
 * Opt-in ambience, off by default: low-passed brown noise, like distant wind and rain.
 * A stand-in from the prototype until the on-site recordings and Howler (Phase 4).
 */
/** `icon`: a speaker icon instead of the words (drive mode's button row), with the row's `className`. */
export default function Sound({ icon = false, className }: { icon?: boolean; className?: string } = {}) {
  const [on, setOn] = useState(false);
  const audio = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null);

  const toggle = () => {
    if (!audio.current) {
      const ctx = new AudioContext(), buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 600;
      const gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(ctx.destination); src.start();
      audio.current = { ctx, gain };
    }
    const { ctx, gain } = audio.current, next = !on;
    if (next && ctx.state === "suspended") void ctx.resume();
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(next ? 0.25 : 0, ctx.currentTime + 0.8);
    horn.sound = next;
    setOn(next);
  };

  if (!icon) return <button type="button" className={styles.mute} aria-pressed={on} onClick={toggle}>{on ? "Sound on" : "Sound off"}</button>;
  return (
    <button type="button" className={className} aria-pressed={on} onClick={toggle} title={on ? "Sound on" : "Sound off"} aria-label={on ? "Sound on" : "Sound off"}>
      <svg viewBox="0 0 24 24" aria-hidden><path d="M11 5 6 9H3v6h3l5 4z" />{on ? <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></> : <path d="m16 9.5 5 5m0-5-5 5" />}</svg>
    </button>
  );
}
