/**
 * The viewer's horn. `honk()` (the Horn button, or H) asks the vehicle ahead to give way for HORN_MS; traffic reads
 * `honking()`. The sound is made with WebAudio (no files), in the voice the player picked (`horn.kind`, remembered on
 * the device): the car's twin "beep-beep", a KSRTC bus's air horn, a lorry's musical horn, a duck, a bicycle bell.
 * On the story page it only plays when the ambience is on (`horn.sound`, set by the Sound button); in drive mode
 * pressing the horn always sounds it (`honk({ audible: true })` — the press is the player asking for it). The give-way
 * works either way.
 */
const HORN_MS = 1800;
export type HornKind = "car" | "bus" | "lorry" | "duck" | "bell" | "chenda" | "synth";
export const HORNS: { id: HornKind; name: string; icon: string }[] = [
  { id: "car", name: "Car", icon: "🚗" }, { id: "bus", name: "Bus", icon: "🚌" }, { id: "lorry", name: "Lorry tune", icon: "🚚" },
  { id: "duck", name: "Duck", icon: "🦆" }, { id: "bell", name: "Bell", icon: "🔔" },
];
/** Horns from the ₹ shop (lib/shop): offered only once bought. */
export const HORN_EXTRAS: { id: HornKind; name: string; icon: string }[] = [
  { id: "chenda", name: "Chenda melam", icon: "🥁" },
  { id: "synth", name: "Synthwave", icon: "🎹" },
];
const SAVED = "wayanad-horn";
// one object for the page, wherever this module is bundled (the HUD and the 3D scene load in different chunks)
type HornState = { until: number; sound: boolean; kind: HornKind };
export const horn: HornState = ((globalThis as { __wayanadHorn?: HornState }).__wayanadHorn ??= { until: 0, sound: false, kind: savedKind() });
let ctx: AudioContext | null = null;

function savedKind(): HornKind {
  try { const k = localStorage.getItem(SAVED) as HornKind | null; if (k && [...HORNS, ...HORN_EXTRAS].some((h) => h.id === k)) return k; } catch {}
  return "car";
}
/** Pick the horn's voice (remembered on this device). */
export function setHornKind(kind: HornKind) {
  horn.kind = kind;
  try { localStorage.setItem(SAVED, kind); } catch {}
}

export function honking() { return typeof performance !== "undefined" && performance.now() < horn.until; }

/** `preview`: only the sound (choosing a horn), no give-way; `kind`: play that voice instead of the chosen one. */
/** Called on each of your own honks (not traffic's, not a preview): components/scene/Animals spots animals with it. */
export const onHonk = new Set<() => void>();
export function honk({ audible = false, preview = false, kind }: { audible?: boolean; preview?: boolean; kind?: HornKind } = {}) {
  if (!preview) { horn.until = performance.now() + HORN_MS; onHonk.forEach((f) => f()); }
  if (!horn.sound && !audible) return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  VOICES[kind ?? horn.kind](ctx, ctx.currentTime);
}

/** A held note: oscillators at `freqs` through a gain envelope into `out`, from t for `length` s. */
function note(c: AudioContext, out: AudioNode, t: number, length: number, freqs: number[], { type = "sawtooth" as OscillatorType, level = 0.12, attack = 0.02, release = 0.04, bend = 1 } = {}) {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(level, t + attack);
  gain.gain.setValueAtTime(level, t + length - release); gain.gain.linearRampToValueAtTime(0, t + length);
  gain.connect(out);
  for (const f of freqs) {
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f * bend, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o.connect(gain); o.start(t); o.stop(t + length + 0.02);
  }
}
function lowpass(c: AudioContext, hz: number) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = hz; f.connect(c.destination); return f; }

const VOICES: Record<HornKind, (c: AudioContext, t: number) => void> = {
  // two horns a third apart: beep-beep
  car: (c, t) => { const out = lowpass(c, 2400); note(c, out, t, 0.16, [392, 494]); note(c, out, t + 0.22, 0.3, [392, 494]); },
  // a KSRTC bus's air horn: low, long, the pitch settling as the air comes through
  bus: (c, t) => { const out = lowpass(c, 1600); note(c, out, t, 0.85, [233, 294, 350], { level: 0.11, attack: 0.05, release: 0.12, bend: 0.88 }); },
  // a lorry's musical horn: a little tune
  lorry: (c, t) => {
    const out = lowpass(c, 2600), tune = [392, 494, 587, 494, 784];
    tune.forEach((f, i) => note(c, out, t + i * 0.15, i === tune.length - 1 ? 0.32 : 0.13, [f, f * 1.005], { type: "square", level: 0.07, attack: 0.01, release: 0.03 }));
  },
  // a rubber duck: two quacks, a falling nasal buzz
  duck: (c, t) => {
    for (const at of [0, 0.24]) {
      const band = c.createBiquadFilter(); band.type = "bandpass"; band.frequency.value = 1100; band.Q.value = 3; band.connect(c.destination);
      const gain = c.createGain(), o = c.createOscillator(), s = t + at;
      o.type = "sawtooth"; o.frequency.setValueAtTime(340, s); o.frequency.exponentialRampToValueAtTime(210, s + 0.17);
      gain.gain.setValueAtTime(0, s); gain.gain.linearRampToValueAtTime(0.5, s + 0.015); gain.gain.exponentialRampToValueAtTime(0.001, s + 0.19);
      o.connect(gain); gain.connect(band); o.start(s); o.stop(s + 0.2);
    }
  },
  // (from the ₹ shop, lib/shop) a chenda roll, the temple drum: quick sharp strokes, faster, an accent to end on
  chenda: (c, t) => {
    const hits = [0, 0.11, 0.2, 0.27, 0.33, 0.38, 0.43, 0.56];
    hits.forEach((at, i) => {
      const s = t + at, accent = i === hits.length - 1 ? 1.6 : i % 2 ? 0.7 : 1;
      const n = c.createBufferSource(), len = Math.floor(c.sampleRate * 0.12), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.exp(-k / (c.sampleRate * 0.018));
      n.buffer = buf;
      const band = c.createBiquadFilter(); band.type = "bandpass"; band.frequency.value = 1900; band.Q.value = 1.4;
      const g = c.createGain(); g.gain.value = 0.55 * accent; n.connect(band); band.connect(g); g.connect(c.destination); n.start(s);
      const o = c.createOscillator(), og = c.createGain(); o.type = "sine"; o.frequency.setValueAtTime(330, s); o.frequency.exponentialRampToValueAtTime(190, s + 0.09);
      og.gain.setValueAtTime(0.25 * accent, s); og.gain.exponentialRampToValueAtTime(0.001, s + 0.12); o.connect(og); og.connect(c.destination); o.start(s); o.stop(s + 0.13);
    });
  },
  // (from the ₹ shop) synthwave: a quick rising arpeggio and a held chord, detuned saws
  synth: (c, t) => {
    const out = lowpass(c, 3200);
    [440, 523.25, 659.25, 880].forEach((f, i) => note(c, out, t + i * 0.07, 0.09, [f, f * 1.008], { level: 0.06, attack: 0.005, release: 0.03 }));
    note(c, out, t + 0.3, 0.45, [220, 329.63, 440, 440 * 1.006], { level: 0.05, attack: 0.02, release: 0.2 });
  },
  // a bicycle bell: two bright metallic rings
  bell: (c, t) => {
    for (const at of [0, 0.2]) for (const [f, level] of [[2350, 0.06], [3290, 0.035], [5170, 0.02]]) {
      const gain = c.createGain(), o = c.createOscillator(), s = t + at;
      o.type = "sine"; o.frequency.value = f;
      gain.gain.setValueAtTime(0, s); gain.gain.linearRampToValueAtTime(level, s + 0.004); gain.gain.exponentialRampToValueAtTime(0.0005, s + 0.6);
      o.connect(gain); gain.connect(c.destination); o.start(s); o.stop(s + 0.62);
    }
  },
};

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

/** A race's countdown: a short beep for 3, 2, 1 and a higher, longer one for GO. Only with the sound on. */
export function beep(go = false) {
  if (!horn.sound) return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  const t = ctx.currentTime + 0.01, len = go ? 0.55 : 0.18, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "square"; o.frequency.value = go ? 1046 : 523;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.01); g.gain.setValueAtTime(0.06, t + len - 0.05); g.gain.linearRampToValueAtTime(0, t + len);
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 3000;
  o.connect(f).connect(g).connect(ctx.destination); o.start(t); o.stop(t + len + 0.02);
}

/** A monkey: a few quick rising "ooh"s (sine glides). Only with the sound on. */
export function chatter() {
  if (!horn.sound) return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  for (let i = 0; i < 4; i++) {
    const t = ctx.currentTime + i * 0.13 + Math.random() * 0.03, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(520 + Math.random() * 80, t); o.frequency.exponentialRampToValueAtTime(980 + Math.random() * 200, t + 0.09);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.11);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.12);
  }
}
