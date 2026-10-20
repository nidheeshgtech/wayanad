/**
 * The viewer's horn. `honk()` (the Horn button, or H) asks the vehicle ahead to give way for HORN_MS; traffic reads
 * `honking()`. The sound is a short two-tone "beep-beep" made with WebAudio (no file), and only plays when the
 * ambience is on (`horn.sound`, set by the Sound button) — the give-way works either way.
 */
const HORN_MS = 1800;
// one object for the page, wherever this module is bundled (the HUD and the 3D scene load in different chunks)
type HornState = { until: number; sound: boolean };
export const horn: HornState = ((globalThis as { __wayanadHorn?: HornState }).__wayanadHorn ??= { until: 0, sound: false });
let ctx: AudioContext | null = null;

export function honking() { return typeof performance !== "undefined" && performance.now() < horn.until; }

export function honk() {
  horn.until = performance.now() + HORN_MS;
  if (!horn.sound) return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  const out = ctx.createBiquadFilter(); out.type = "lowpass"; out.frequency.value = 2400; out.connect(ctx.destination);
  for (const [start, length] of [[0, 0.16], [0.22, 0.3]]) {
    const gain = ctx.createGain(), t = ctx.currentTime + start;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
    gain.gain.setValueAtTime(0.12, t + length - 0.04); gain.gain.linearRampToValueAtTime(0, t + length);
    gain.connect(out);
    for (const f of [392, 494]) { // two horns a third apart, like a bus's twin horn
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
      o.connect(gain); o.start(t); o.stop(t + length + 0.02);
    }
  }
}
