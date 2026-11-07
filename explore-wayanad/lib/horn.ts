/**
 * The viewer's horn. `honk()` (the Horn button, or H) asks the vehicle ahead to give way for HORN_MS; traffic reads
 * `honking()`. The sound is a short two-tone "beep-beep" made with WebAudio (no file). On the story page it only plays
 * when the ambience is on (`horn.sound`, set by the Sound button); in drive mode pressing the horn always sounds it
 * (`honk({ audible: true })` — the press is the player asking for it). The give-way works either way.
 */
const HORN_MS = 1800;
// one object for the page, wherever this module is bundled (the HUD and the 3D scene load in different chunks)
type HornState = { until: number; sound: boolean };
export const horn: HornState = ((globalThis as { __wayanadHorn?: HornState }).__wayanadHorn ??= { until: 0, sound: false });
let ctx: AudioContext | null = null;

export function honking() { return typeof performance !== "undefined" && performance.now() < horn.until; }

export function honk({ audible = false } = {}) {
  horn.until = performance.now() + HORN_MS;
  if (!horn.sound && !audible) return;
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

/** A coin picked up: a short bright "ding" (two sine partials), a rising pair for a hairpin coin. Only with the sound on. */
export function chime(big = false) {
  if (!horn.sound) return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  const notes = big ? [[0, 1319], [0.09, 1760]] : [[0, 1568]];
  for (const [start, f] of notes) {
    const t = ctx.currentTime + start, gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.07, t + 0.008); gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.35);
    gain.connect(ctx.destination);
    for (const [k, level] of [[1, 1], [2.76, 0.25]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f * k; g.gain.value = level;
      o.connect(g); g.connect(gain); o.start(t); o.stop(t + 0.4);
    }
  }
}
