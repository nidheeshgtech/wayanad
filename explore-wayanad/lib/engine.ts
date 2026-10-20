/** A diesel bus's engine note for drive mode: two low detuned saws through a low-pass, pitch and loudness following
 * speed and throttle. WebAudio, no file; only while the ambience is on (lib/horn's `horn.sound`). */
let ctx: AudioContext | null = null, osc: OscillatorNode[] = [], gain: GainNode | null = null, filter: BiquadFilterNode | null = null;

export function engine(on: boolean, speed: number, throttle: number) {
  if (!on) { if (gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2); return; }
  if (!ctx) {
    ctx = new AudioContext();
    filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 380;
    gain = ctx.createGain(); gain.gain.value = 0;
    filter.connect(gain).connect(ctx.destination);
    osc = [0, 3].map((detune) => { const o = ctx!.createOscillator(); o.type = "sawtooth"; o.detune.value = detune * 10; o.connect(filter!); o.start(); return o; });
  }
  if (ctx.state === "suspended") void ctx.resume();
  const f = 34 + Math.abs(speed) * 34 + throttle * 8, t = ctx.currentTime;
  for (const o of osc) o.frequency.setTargetAtTime(f, t, 0.15);
  filter!.frequency.setTargetAtTime(300 + throttle * 500, t, 0.2);
  gain!.gain.setTargetAtTime(0.025 + throttle * 0.05 + Math.abs(speed) * 0.01, t, 0.2);
}
