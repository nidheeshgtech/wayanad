/**
 * Collision feedback for drive mode: a hit against traffic or the roadside edge (barrier posts, the bank) sets a
 * strength 0–1 from how hard it was, and three envelopes fade back from it — `flash` (the red flash, ~0.3 s), `glow`
 * (the red vignette, blur and colour fringing, ~0.6 s) and `shake` (the camera, ~0.4 s). Strong, fast impacts reach
 * full strength; a graze barely shows. Read each frame by components/drive/ImpactFx.tsx (the screen) and PlayerCar
 * (the camera); stepped once a frame by ImpactFx. The thud is WebAudio, no file; like the horn it always plays in
 * drive mode (the drive started from a press, so audio is allowed). Physics is untouched: this only listens.
 */
type ImpactState = { flash: number; glow: number; shake: number; time: number };
export const impact: ImpactState = ((globalThis as { __wayanadImpact?: ImpactState }).__wayanadImpact ??= { flash: 0, glow: 0, shake: 0, time: 0 });

const MIN = 0.08;                                 // below this a touch is a graze: no effect
const FADE = { flash: 0.12, glow: 0.26, shake: 0.14 }; // s: exponential time constants (≈ 3τ to fade out)
let lastSound = -1;

/** A collision of `strength` 0–1 (≈ closing speed: 1 is about 36 km/h, or a square hit on the barrier at speed). */
export function hit(strength: number) {
  if (strength < MIN) return;
  // a softer curve near the bottom, so small knocks stay small and big ones reach the top
  const s = Math.min(1, ((strength - MIN) / (1 - MIN)) ** 0.8);
  // a fresh hit only counts if it's harder than what is still showing (scraping along keeps it alive, not stacking)
  if (s <= impact.glow * 0.85) return;
  impact.flash = Math.max(impact.flash, s); impact.glow = Math.max(impact.glow, s); impact.shake = Math.max(impact.shake, s);
  if (impact.time - lastSound > 0.3 || s > 0.6) { lastSound = impact.time; thud(s); }
}

export function stepImpact(dt: number) {
  impact.time += dt;
  impact.flash *= Math.exp(-dt / FADE.flash);
  impact.glow *= Math.exp(-dt / FADE.glow);
  impact.shake *= Math.exp(-dt / FADE.shake);
  if (impact.glow < 0.002) impact.flash = impact.glow = impact.shake = 0;
}

let ctx: AudioContext | null = null, noise: AudioBuffer | null = null;
/** A body thump (falling sine) under a short crunch of filtered noise; both louder and lower the harder the hit. */
function thud(s: number) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const c = ctx, t = c.currentTime;
    if (!noise) {
      noise = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    }
    const out = c.createGain(); out.gain.value = 0.25 + 0.55 * s; out.connect(c.destination);
    const body = c.createOscillator(), bodyGain = c.createGain();
    body.type = "sine"; body.frequency.setValueAtTime(90 + 40 * s, t); body.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    bodyGain.gain.setValueAtTime(0.9, t); bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    body.connect(bodyGain).connect(out); body.start(t); body.stop(t + 0.3);
    const crunch = c.createBufferSource(), band = c.createBiquadFilter(), crunchGain = c.createGain();
    crunch.buffer = noise; band.type = "bandpass"; band.frequency.value = 900 + 1600 * s; band.Q.value = 0.8;
    crunchGain.gain.setValueAtTime(0.5 * s + 0.15, t); crunchGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12 + 0.2 * s);
    crunch.connect(band).connect(crunchGain).connect(out); crunch.start(t); crunch.stop(t + 0.45);
  } catch { /* no audio: the picture still shows the hit */ }
}
