import { horn } from "./horn";

/** The rush of a roadside waterfall: filtered noise, louder as you near it (within ~60 m) and when it runs full.
 * WebAudio, no file; only while the ambience is on (lib/horn's `horn.sound`). */
let ctx: AudioContext | null = null, gain: GainNode | null = null;

export function waterSound(distance: number, flow: number) {
  const level = horn.sound ? Math.max(0, 1 - distance / 6) ** 1.5 * (0.35 + 0.65 * flow) * 0.22 : 0;
  if (!gain) {
    if (level <= 0) return;
    ctx ??= new AudioContext();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const band = ctx.createBiquadFilter(); band.type = "bandpass"; band.frequency.value = 1100; band.Q.value = 0.6;
    const low = ctx.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 300; low.gain.value = 6;
    gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(band).connect(low).connect(gain).connect(ctx.destination); src.start();
  }
  if (ctx!.state === "suspended" && level > 0) void ctx!.resume();
  gain!.gain.setTargetAtTime(level, ctx!.currentTime, 0.3);
}

/** Thunder after a lightning flash, `delay` seconds later (the storm a few hundred metres to a kilometre off): a low
 * rumble of filtered noise swelling and rolling away. Only with the ambience on. */
export function thunder(delay: number) {
  if (!horn.sound) return;
  const c = (ctx ??= new AudioContext());
  if (c.state === "suspended") void c.resume();
  const len = 3.5, buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; d[i] = last * 6; }
  const src = c.createBufferSource(); src.buffer = buf;
  const low = c.createBiquadFilter(); low.type = "lowpass"; low.frequency.value = 220;
  const g = c.createGain(), t = c.currentTime + delay;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.25); g.gain.setTargetAtTime(0, t + 0.8, 0.9);
  src.connect(low).connect(g).connect(c.destination); src.start(t);
}
