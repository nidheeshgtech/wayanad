/**
 * The churam's sounds in drive mode, all made with WebAudio (no files), only while the ambience is on (lib/horn's
 * `horn.sound`, the Sound button):
 *   rain     hiss of rain, with the roof drumming louder from the bonnet view; follows weather.rain
 *   birds    by day and out of heavy rain: quick chirps, trills and now and then a koel's rising "ku-oo"
 *   crickets at night: two crickets pulsing, high and thin
 *   valley   now and then a bus's horn somewhere down the ghat, echoing off the hills
 * (The engine is lib/engine, a waterfall's rush and thunder lib/water, the wind bed the Sound button itself.)
 * `ambience()` runs every frame from the HUD with what it needs; one AudioContext for all of it.
 */
type Input = { on: boolean; rain: number; night: number; hood: boolean; speed: number };

let c: AudioContext | null = null;
let rainGain: GainNode, roofGain: GainNode, cricketGain: GainNode, echoIn: GainNode;
let nextBird = 0, nextHorn = 0;

function noise(ctx: AudioContext, brown = false) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.start();
  return src;
}

function build() {
  const ctx = (c = new AudioContext());
  // rain: bright hiss, and a low drum on the roof
  rainGain = ctx.createGain(); rainGain.gain.value = 0; rainGain.connect(ctx.destination);
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1200;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 7500;
  noise(ctx).connect(hp).connect(lp).connect(rainGain);
  roofGain = ctx.createGain(); roofGain.gain.value = 0; roofGain.connect(ctx.destination);
  const drum = ctx.createBiquadFilter(); drum.type = "bandpass"; drum.frequency.value = 520; drum.Q.value = 0.8;
  noise(ctx, true).connect(drum).connect(roofGain);
  // crickets: a high tone, chopped fast (a square LFO on its gain), in slow bursts
  cricketGain = ctx.createGain(); cricketGain.gain.value = 0; cricketGain.connect(ctx.destination);
  for (const [f, chop, burst] of [[4400, 31, 1.7], [5150, 26, 1.1]]) {
    const tone = ctx.createOscillator(); tone.frequency.value = f;
    const chopper = ctx.createGain(); chopper.gain.value = 0.5; // 0.5 ± 0.5: on and off
    const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = chop;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.5; lfo.connect(lfoAmt).connect(chopper.gain);
    const burster = ctx.createGain(); burster.gain.value = 0.5;
    const slow = ctx.createOscillator(); slow.type = "square"; slow.frequency.value = burst;
    const slowAmt = ctx.createGain(); slowAmt.gain.value = 0.5; slow.connect(slowAmt).connect(burster.gain);
    tone.connect(chopper).connect(burster).connect(cricketGain);
    for (const o of [tone, lfo, slow]) o.start();
  }
  // the valley: a feedback echo for far-off horns
  echoIn = ctx.createGain(); echoIn.gain.value = 1;
  const delay = ctx.createDelay(2); delay.delayTime.value = 0.42;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 1100;
  echoIn.connect(tone); tone.connect(ctx.destination); tone.connect(delay); delay.connect(fb).connect(delay); delay.connect(ctx.destination);
}

/** One bird call, panned somewhere in the trees. */
function bird(ctx: AudioContext, level: number) {
  const t = ctx.currentTime + 0.02, pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(ctx.destination);
  const call = (at: number, f0: number, f1: number, len: number, gain: number) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + len);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0005, at + len);
    o.connect(g).connect(pan); o.start(at); o.stop(at + len + 0.02);
  };
  const kind = Math.random();
  if (kind < 0.18) {
    // the koel: "ku-oo", rising, two or three times
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) { const at = t + i * 0.62, f = 700 + i * 60; call(at, f, f * 1.12, 0.12, level * 0.9); call(at + 0.14, f * 1.15, f * 1.5, 0.3, level); }
  } else if (kind < 0.6) {
    // a few quick chirps
    const n = 3 + Math.floor(Math.random() * 4), f = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) call(t + i * (0.07 + Math.random() * 0.04), f, f * (1.3 + Math.random() * 0.3), 0.055, level * 0.7);
  } else {
    // a trill
    const f = 3200 + Math.random() * 1500;
    for (let i = 0; i < 10; i++) call(t + i * 0.035, f, f * 0.92, 0.03, level * 0.5);
  }
}

/** A bus far down the ghat sounds its horn: low, short, through the echo. */
function farHorn(ctx: AudioContext, level: number) {
  const t = ctx.currentTime + 0.02, g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.05); g.gain.setValueAtTime(level, t + 0.55); g.gain.linearRampToValueAtTime(0, t + 0.7);
  g.connect(echoIn);
  for (const f of [233, 294]) { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.75); }
}

export function ambience({ on, rain, night, hood, speed }: Input) {
  if (!c) { if (!on) return; build(); }
  const ctx = c!, now = ctx.currentTime;
  if (on && ctx.state === "suspended") void ctx.resume();
  const k = on ? 1 : 0, day = Math.max(0, 1 - night * 1.4);
  rainGain.gain.setTargetAtTime(k * rain * (hood ? 0.09 : 0.13), now, 0.4);
  roofGain.gain.setTargetAtTime(k * rain * (hood ? 0.32 : 0.12), now, 0.4);
  cricketGain.gain.setTargetAtTime(k * Math.max(0, night - 0.3) * (1 - rain * 0.7) * 0.022, now, 0.8);
  if (!on) return;
  const t = performance.now() / 1000;
  // birds: more often in daylight and dry weather, hushed by rain and drowned by speed
  const birds = day * (1 - rain * 0.85);
  if (birds > 0.15 && t > nextBird) { bird(ctx, 0.035 * birds / (1 + Math.abs(speed))); nextBird = t + 1.5 + Math.random() * 4 / birds; }
  if (t > nextHorn) { if (nextHorn) farHorn(ctx, 0.022); nextHorn = t + 25 + Math.random() * 35; }
}
