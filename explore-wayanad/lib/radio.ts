/**
 * The car radio: three stations of music made here, in WebAudio, as it plays (no recordings, nobody's copyright), a
 * new "song" every 16 bars (its own chords, seed and title), and between songs, now and then, the station's RJ says
 * something in Manglish (the HUD shows it: components/drive/RadioHud). Q (or the radio key) changes station; the choice
 * is kept on the device. Only with the game's sound on (lib/horn), only while driving: it fades out when you pause, stop
 * or get out, and dips while a friend talks (lib/engine's mix).
 */
import { horn } from "@/lib/horn";
import { mix } from "@/lib/engine";
import { weather } from "@/lib/weather";
import { nightness } from "@/lib/theme";
import { chase } from "@/lib/chase";
import { jobs } from "@/lib/jobs";

export type StationId = "off" | "kalpetta" | "night" | "ulsavam";
export const STATIONS: { id: Exclude<StationId, "off">; name: string; freq: string; tag: string; rj: string }[] = [
  { id: "kalpetta", name: "Kalpetta FM", freq: "91.8", tag: "Chill for the plateau", rj: "RJ Meera" },
  { id: "night", name: "Churam Night", freq: "98.4", tag: "Synthwave after dark", rj: "RJ Arjun" },
  { id: "ulsavam", name: "Ulsavam Beats", freq: "104.2", tag: "Chenda and the festival", rj: "RJ Unni" },
];
const TITLES: Record<Exclude<StationId, "off">, string[]> = {
  kalpetta: ["Mist on the Tea", "Pookode Mornings", "Slow Lane to Vythiri", "Chaya Break", "Plateau Drift", "Rain Somewhere Else"],
  night: ["Neon Hairpins", "Ninth Bend", "Midnight Lakkidi", "Wet Asphalt", "Indigo Ghat", "Tail Lights"],
  ulsavam: ["Pooram Run", "Chenda Melam", "Kottu", "Elathalam Rain", "Temple Road", "Thrissur to Wayanad"],
};
const KEY = "wayanad-radio";

type Song = { title: string; seed: number; prog: number[][]; bars: number };
const state = ((globalThis as { __wayanadRadio?: unknown }).__wayanadRadio ??= {
  station: (() => { try { const v = localStorage.getItem(KEY) as StationId | null; return v && (v === "off" || STATIONS.some((s) => s.id === v)) ? v : "night"; } catch { return "night" as StationId; } })(),
  popup: null as null | { title: string; sub: string; at: number; rj?: boolean },
  song: null as Song | null, songN: 0,
}) as { station: StationId; popup: null | { title: string; sub: string; at: number; rj?: boolean }; song: Song | null; songN: number };
export const radio = state;

let ctx: AudioContext | null = null, master: GainNode | null = null, noise: AudioBuffer | null = null;
let next = 0, step = 0, playing = false, playingId: StationId = "off";

/** Change station: the next one round (off at the end), the name on screen. */
export function nextStation() {
  const order: StationId[] = ["kalpetta", "night", "ulsavam", "off"];
  setStation(order[(order.indexOf(state.station) + 1) % order.length]);
}
export function setStation(id: StationId) {
  state.station = id; try { localStorage.setItem(KEY, id); } catch {}
  state.song = null;
  const s = STATIONS.find((x) => x.id === id);
  state.popup = s ? { title: `📻 ${s.name} ${s.freq}`, sub: s.tag, at: performance.now() } : { title: "📻 Radio off", sub: "Q to turn it back on", at: performance.now() };
}

// ---- little instruments ----
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
let rnd = 1; const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
function tone(t: number, f: number, d: number, { type = "sine" as OscillatorType, g = 0.1, a = 0.01, rel = 0.1, cut = 0, det = 0, q = 0.7 } = {}) {
  const c = ctx!, o = c.createOscillator(), v = c.createGain(); o.type = type; o.frequency.value = f; o.detune.value = det;
  v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + a); v.gain.setValueAtTime(g, t + Math.max(a, d - rel)); v.gain.linearRampToValueAtTime(0, t + d);
  let out: AudioNode = v;
  if (cut) { const f2 = c.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = cut; f2.Q.value = q; v.connect(f2); out = f2; }
  o.connect(v); out.connect(master!); o.start(t); o.stop(t + d + 0.05);
}
function hit(t: number, d: number, { type = "highpass" as BiquadFilterType, f = 7000, g = 0.08, q = 0.7 } = {}) {
  const c = ctx!, n = c.createBufferSource(), fl = c.createBiquadFilter(), v = c.createGain();
  n.buffer = noise; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0008, t + d);
  n.connect(fl); fl.connect(v); v.connect(master!); n.start(t, r() * 0.5); n.stop(t + d + 0.02);
}
function kick(t: number, g = 0.5, top = 150) {
  const c = ctx!, o = c.createOscillator(), v = c.createGain(); o.frequency.setValueAtTime(top, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.001, t + 0.32); o.connect(v); v.connect(master!); o.start(t); o.stop(t + 0.34);
}
function bell(t: number, f: number, g = 0.04, d = 0.9) { for (const [k, w] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) tone(t, f * k, d, { g: g * w, a: 0.002, rel: d * 0.9 }); }

// ---- the stations: one 16th (or, for Ulsavam, one of twelve) each step ----
const STATION = {
  kalpetta: { bpm: 80, steps: 16, progs: [[[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 67]], [[64, 67, 71, 74], [57, 60, 64, 67], [62, 66, 69, 72], [55, 59, 62, 66]], [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]]] },
  night: { bpm: 100, steps: 16, progs: [[[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]], [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]]] },
  ulsavam: { bpm: 132, steps: 12, progs: [[[62]], [[64]], [[60]]] },
} as const;
const SCALE_UL = [62, 64, 66, 69, 71, 74, 76]; // the kuzhal's notes over the drone

function play(id: Exclude<StationId, "off">, t: number, i: number, song: Song) {
  const S = STATION[id], bar = Math.floor(i / S.steps), s = i % S.steps, ch = song.prog[bar % song.prog.length], sixteenth = 60 / S.bpm / 4;
  rnd = song.seed * 7919 + bar * 131 + s * 17 + 1;
  if (id === "kalpetta") {
    const swing = s % 2 ? sixteenth * 0.18 : 0, tt = t + swing;
    if (s === 0 || s === 10) for (const m of ch) tone(t, hz(m), sixteenth * (s === 0 ? 11 : 7), { type: "triangle", g: 0.035, a: 0.02, rel: 0.5, cut: 1800 });
    if (s % 4 === 0) hit(t, sixteenth * 4.2, { type: "bandpass", f: 3200, g: 0.006, q: 0.4 }); // the record's crackle under it all
    if (s === 0 || s === 7 || s === 10) kick(t, 0.35, 110);
    if (s === 4 || s === 12) hit(t, 0.18, { type: "bandpass", f: 1800, g: 0.08, q: 0.8 });
    if (s % 2 === 0) hit(tt, 0.05, { f: 8000, g: s % 4 ? 0.018 : 0.03 });
    if (s === 0 || s === 6 || s === 10) tone(t, hz(ch[0] - 24), sixteenth * 3.5, { type: "sine", g: 0.16, a: 0.01, rel: 0.1 });
    if (r() < 0.22 && s % 2 === 0) tone(tt, hz(ch[Math.floor(r() * ch.length)] + 12), sixteenth * 2, { type: "sine", g: 0.035, rel: 0.15 });
  } else if (id === "night") {
    if (s % 4 === 0) kick(t, 0.55, 160);
    if (s === 4 || s === 12) { hit(t, 0.3, { type: "bandpass", f: 2200, g: 0.12, q: 0.6 }); tone(t, 190, 0.12, { g: 0.06, a: 0.002, rel: 0.1 }); }
    hit(t, 0.03, { f: 9000, g: s % 2 ? 0.012 : 0.02 });
    if (s % 2 === 0) tone(t, hz(ch[0] - 24 + (s % 4 === 2 ? 12 : 0)), sixteenth * 1.8, { type: "sawtooth", g: 0.07, cut: 700, q: 4, rel: 0.05 });
    const arp = [0, 1, 2, 1, 0, 2, 1, 2], m = ch[arp[s % 8] % ch.length] + 12 + (bar % 4 === 3 && s > 8 ? 12 : 0);
    tone(t, hz(m), sixteenth * 0.9, { type: "square", g: 0.022, cut: 2600 + 1200 * Math.sin(bar), rel: 0.04 });
    if (s === 0) for (const k of ch) for (const d of [-9, 9]) tone(t, hz(k), sixteenth * 16, { type: "sawtooth", g: 0.012, a: 0.4, rel: 0.6, cut: 1400, det: d });
  } else {
    // a chenda pattern in twelve, the edges sharp (bandpass noise and a pitched slap), the strong strokes on 1, 4, 7, 10
    const pat = [1, 0, 0.6, 1, 0, 0.6, 1, 0.5, 0.6, 1, 0.6, 0.8], vel = pat[s] * (bar % 8 === 7 && s > 5 ? 1.25 : 1);
    if (vel > 0 && (vel >= 0.6 || r() < 0.6)) { hit(t, 0.09, { type: "bandpass", f: 2000, g: 0.26 * vel, q: 1.5 }); tone(t, 330 - 60 * r(), 0.1, { g: 0.11 * vel, a: 0.002, rel: 0.08 }); }
    if (s === 0 || s === 6) kick(t, 0.45, 120);                               // the thimila's low stroke
    if (s % 3 === 0) bell(t, s % 6 ? 3300 : 3000, 0.022, 0.5);                 // elathalam
    if (s === 0 && bar % 2 === 0) { tone(t, hz(50), sixteenth * 24, { type: "sawtooth", g: 0.02, a: 0.3, rel: 0.4, cut: 500 }); tone(t, hz(57), sixteenth * 24, { type: "sawtooth", g: 0.014, a: 0.3, rel: 0.4, cut: 500 }); }
    if (bar % 4 >= 2 && s % 3 === 0 && r() < 0.8) tone(t, hz(SCALE_UL[Math.floor(r() * SCALE_UL.length)] + 12), sixteenth * 2.8, { type: "square", g: 0.02, cut: 1600, q: 3, a: 0.03, rel: 0.12 });
  }
}

function newSong(id: Exclude<StationId, "off">): Song {
  state.songN++;
  const progs = STATION[id].progs, titles = TITLES[id], k = state.songN + Math.floor(Math.random() * 5);
  return { title: titles[k % titles.length], seed: k, prog: progs[k % progs.length].map((c) => [...c]), bars: 16 };
}

/** What the RJ says between songs, about what's happening on the road. */
function rjLine(id: Exclude<StationId, "off">) {
  const lines: string[] = [];
  if (chase.stars > 0) lines.push("Breaking news: Vythiri-il oru car police-ine vettichu oodunnu! Aara athu? 😄");
  if (jobs.active) lines.push(`${jobs.active.job.who}-nte pani aano? Samayathu ethikko, ketto!`);
  if (weather.rain > 0.6) lines.push("Churam-il nalla mazha aanu. Pathukke po, headlight on aakkikko.");
  if (nightness() > 0.5) lines.push("Raathri aayi, Wayanad urangiyilla. Adutha paattu ningalkku vendi.");
  lines.push(
    id === "kalpetta" ? "Kalpetta FM, ningalude koode. Oru chaya kudichittu drive cheyyoo." :
    id === "night" ? "Churam Night, 98.4. Neon-um mazhayum, pinne ee paattum." :
    "Ulsavam Beats! Chenda kottu kelkkumbol accelerator thaane amarum, sookshikkanam!",
  );
  return lines[Math.floor(Math.random() * lines.length)];
}

/** Each HUD frame: play the station ahead of time while `on` (driving, unpaused, sound on); fade out otherwise. */
export function radioTick(on: boolean) {
  const id = state.station;
  const want = on && horn.sound && id !== "off";
  if (!want) {
    if (playing && ctx && master) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 0.15); }
    playing = false; return;
  }
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = 0; master.connect(comp);
    (globalThis as { __wayanadRadioOut?: AudioNode }).__wayanadRadioOut = comp; // (for recording it in tests)
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  const st = id as Exclude<StationId, "off">;
  if (!playing || playingId !== id) { next = ctx.currentTime + 0.08; step = 0; playing = true; playingId = id; }
  master!.gain.setTargetAtTime(0.32 * mix.duck, ctx.currentTime, 0.3);
  if (!state.song) { state.song = newSong(st); const s = STATIONS.find((x) => x.id === st)!; if (!state.popup || performance.now() - state.popup.at > 2500) state.popup = { title: `📻 ${s.name} ${s.freq}`, sub: `Now playing · ${state.song.title}`, at: performance.now() }; }
  const S = STATION[st], dur = 60 / S.bpm / 4;
  // (scheduled well ahead: a slow frame mustn't leave a gap; after a long stall, pick up from now, not a burst of late notes)
  if (next < ctx.currentTime) next = ctx.currentTime + 0.05;
  while (next < ctx.currentTime + 0.7) {
    play(st, next, step, state.song!);
    next += dur; step++;
    if (step >= S.steps * state.song!.bars) {
      step = 0; state.song = newSong(st);
      const s = STATIONS.find((x) => x.id === st)!;
      state.popup = Math.random() < 0.6 ? { title: `🎙 ${s.rj}`, sub: rjLine(st), at: performance.now(), rj: true } : { title: `📻 ${s.name} ${s.freq}`, sub: `Now playing · ${state.song.title}`, at: performance.now() };
    }
  }
}
