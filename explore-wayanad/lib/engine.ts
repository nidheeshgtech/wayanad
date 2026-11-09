/** The car's sound for drive mode, all WebAudio (no files), only while the ambience is on (lib/horn's `horn.sound`):
 *   engine   two low detuned saws through a low-pass, pitch and loudness following speed and throttle
 *   exhaust  a throaty rumble: low noise pulsed at the engine's firing rate, louder with throttle and revs
 *   crackle  lift off the throttle at speed and the exhaust pops and crackles for a moment (exhaust.popAt: the flames)
 *   nitro    a rushing whoosh while the nitro fires, a hiss as it cuts in
 */
let ctx: AudioContext | null = null, osc: OscillatorNode[] = [], gain: GainNode | null = null, filter: BiquadFilterNode | null = null;
let rumble: GainNode | null = null, pulse: OscillatorNode | null = null, rumbleBand: BiquadFilterNode | null = null;
let whoosh: GainNode | null = null, whooshBand: BiquadFilterNode | null = null, noiseBuf: AudioBuffer | null = null;
let lastThrottle = 0, wasBoosting = false;

/** The game's own sound, dipped while a friend talks on voice (DriveHud sets `duck`, 0–1). */
export const mix = ((globalThis as { __wayanadMix?: { duck: number } }).__wayanadMix ??= { duck: 1 });

/** When the exhaust last popped (performance.now()), for the flames at the tailpipe (components/drive/TyreSmoke). */
export const exhaust = ((globalThis as { __wayanadExhaust?: { popAt: number } }).__wayanadExhaust ??= { popAt: -1e9 });

function noise(c: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; d[i] = last * 6 + (Math.random() * 2 - 1) * 0.15; }
  }
  const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
}

/** A few sharp pops from the tailpipe over ~0.7 s. */
function crackle(c: AudioContext) {
  const n = 4 + Math.floor(Math.random() * 4), t0 = c.currentTime + 0.05;
  for (let k = 0; k < n; k++) {
    const t = t0 + k * (0.07 + Math.random() * 0.12), src = noise(c), g = c.createGain(), f = c.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 500 + Math.random() * 900; f.Q.value = 1.2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 + Math.random() * 0.1, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    src.connect(f).connect(g).connect(c.destination); src.start(t, Math.random()); src.stop(t + 0.08);
  }
}

export function engine(on: boolean, speed: number, throttle: number, boosting = false) {
  if (!on) {
    if (ctx) for (const g of [gain, rumble, whoosh]) g?.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    lastThrottle = 0; wasBoosting = false;
    return;
  }
  if (!ctx) {
    const c = (ctx = new AudioContext());
    filter = c.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 380;
    gain = c.createGain(); gain.gain.value = 0;
    filter.connect(gain).connect(c.destination);
    osc = [0, 3].map((detune) => { const o = c.createOscillator(); o.type = "sawtooth"; o.detune.value = detune * 10; o.connect(filter!); o.start(); return o; });
    // the exhaust: low noise, its loudness chopped at the firing rate (a square wave on the gain) — the burble
    rumbleBand = c.createBiquadFilter(); rumbleBand.type = "bandpass"; rumbleBand.frequency.value = 110; rumbleBand.Q.value = 0.9;
    const chop = c.createGain(); chop.gain.value = 0.5;
    pulse = c.createOscillator(); pulse.type = "square"; pulse.frequency.value = 30;
    const depth = c.createGain(); depth.gain.value = 0.5; pulse.connect(depth).connect(chop.gain); pulse.start();
    rumble = c.createGain(); rumble.gain.value = 0;
    const src = noise(c); src.connect(rumbleBand).connect(chop).connect(rumble).connect(c.destination); src.start();
    // nitro: bright rushing noise
    whooshBand = c.createBiquadFilter(); whooshBand.type = "bandpass"; whooshBand.frequency.value = 1400; whooshBand.Q.value = 0.6;
    whoosh = c.createGain(); whoosh.gain.value = 0;
    const air = noise(c); air.playbackRate.value = 3.5; air.connect(whooshBand).connect(whoosh).connect(c.destination); air.start();
  }
  if (ctx.state === "suspended") void ctx.resume();
  const v = Math.abs(speed), f = 34 + v * 34 + throttle * 8 + (boosting ? 14 : 0), t = ctx.currentTime;
  for (const o of osc) o.frequency.setTargetAtTime(f, t, 0.15);
  filter!.frequency.setTargetAtTime(300 + throttle * 500 + (boosting ? 400 : 0), t, 0.2);
  gain!.gain.setTargetAtTime((0.025 + throttle * 0.05 + v * 0.01) * mix.duck, t, 0.2);
  pulse!.frequency.setTargetAtTime(f * 0.9, t, 0.1);
  rumbleBand!.frequency.setTargetAtTime(90 + v * 40 + throttle * 60, t, 0.15);
  rumble!.gain.setTargetAtTime(((0.05 + throttle * 0.16) * Math.min(1, 0.35 + v * 0.4) + (boosting ? 0.08 : 0)) * mix.duck, t, 0.12);
  whoosh!.gain.setTargetAtTime(boosting ? 0.07 : 0, t, boosting ? 0.06 : 0.35);
  whooshBand!.frequency.setTargetAtTime(boosting ? 1200 + v * 500 : 900, t, 0.3);
  if (boosting && !wasBoosting) { exhaust.popAt = performance.now(); crackle(ctx); }
  // lifting off at speed: the exhaust pops and crackles (and flames: exhaust.popAt)
  if (lastThrottle > 0.5 && throttle === 0 && v > 1.5 && Math.random() < 0.85) { crackle(ctx); exhaust.popAt = performance.now(); }
  lastThrottle = throttle; wasBoosting = boosting;
}
