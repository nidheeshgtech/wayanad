/**
 * Voice chat in a private room (Play with friends): up to four talkers, each phone connected straight to each other
 * one (WebRTC), so voices never pass through our server — the room only introduces them (lib/net sendRtc / onRtc).
 * Off until you join; the browser asks for the microphone then. Hold to talk by default (V on a keyboard, the mic key
 * on the road), or an open mic. Your voice can go through an effect first: a walkie-talkie, a robot, a valley echo or a
 * monkey (pitched up). Each talker's level is watched so the HUD can show who's talking, the game's own sound dips
 * while anyone does, and any talker can be muted. Plain mutable state like lib/game, `version` bumped on changes.
 * Between each pair the one with the lower id makes the offer; a lost connection is retried by the same rule.
 */
import { net, sendRtc, sendVoice } from "@/lib/net";

export type VoiceFx = "none" | "radio" | "robot" | "echo" | "monkey";
export const VOICE_FX: { id: VoiceFx; name: string; icon: string }[] = [
  { id: "none", name: "Normal", icon: "🎙️" }, { id: "radio", name: "Walkie", icon: "📻" }, { id: "robot", name: "Robot", icon: "🤖" },
  { id: "echo", name: "Echo", icon: "🏔️" }, { id: "monkey", name: "Monkey", icon: "🐒" },
];
const ICE: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
const TALKING = 0.035; // level (RMS) counted as talking

type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; level: AnalyserNode | null; queued: RTCIceCandidateInit[]; state: "connecting" | "live" | "failed"; talking: boolean };
type State = {
  on: boolean; joining: boolean; error: string; full: boolean;
  open: boolean;            // open mic (else hold to talk)
  holding: boolean;         // the talk key held
  fx: VoiceFx;
  meTalking: boolean;
  muted: Set<number>;       // talkers you've muted
  peers: Map<number, Peer>;
  version: number;
};
export const voice: State = ((globalThis as { __wayanadVoice?: State }).__wayanadVoice ??= {
  on: false, joining: false, error: "", full: false, open: false, holding: false, fx: "none", meTalking: false, muted: new Set(), peers: new Map(), version: 0,
});
const bump = () => { voice.version++; };

let ctx: AudioContext | null = null, mic: MediaStream | null = null, out: MediaStreamAudioDestinationNode | null = null;
let src: MediaStreamAudioSourceNode | null = null, chain: AudioNode[] = [], meter: AnalyserNode | null = null, timer: ReturnType<typeof setInterval> | null = null;
const buf = new Float32Array(1024);
const level = (a: AnalyserNode) => { a.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); };

/** The monkey: a two-head pitch shifter (an AudioWorklet, loaded from a blob), up by `ratio`. */
const SHIFTER = `class S extends AudioWorkletProcessor{constructor(){super();this.n=8192;this.b=new Float32Array(this.n);this.w=0;this.p=0;this.W=1100;this.r=1.75}
process(i,o){const a=i[0]&&i[0][0],y=o[0][0];if(!a){y&&y.fill(0);return true}const n=this.n,W=this.W,b=this.b;
for(let k=0;k<a.length;k++){b[this.w]=a[k];let s=0;for(let h=0;h<2;h++){const ph=(this.p+h*.5)%1,d=(1-ph)*W+2,rp=this.w-d,f=Math.floor(rp),fr=rp-f,i0=((f%n)+n)%n,i1=(i0+1)%n;
const v=b[i0]+(b[i1]-b[i0])*fr,g=Math.sin(Math.PI*ph);s+=v*g*g}y[k]=s;this.p=(this.p+(this.r-1)/W)%1;this.w=(this.w+1)%n}
for(let c=1;c<o[0].length;c++)o[0][c].set(y);return true}}registerProcessor("pitch-up",S);`;
let shifterReady: Promise<void> | null = null;

/** The effect between the microphone and what's sent. */
async function wire() {
  if (!ctx || !src || !out) return;
  src.disconnect(); for (const n of chain) n.disconnect(); chain = [];
  if (meter) src.connect(meter); // (the disconnect above took the level meter off too)
  const c = ctx, link = (...nodes: AudioNode[]) => { let prev: AudioNode = src!; for (const n of nodes) { prev.connect(n); prev = n; } prev.connect(out!); chain.push(...nodes); };
  if (voice.fx === "radio") {
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 450;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2800;
    const shape = c.createWaveShaper(); const k = 18, curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    shape.curve = curve; const g = c.createGain(); g.gain.value = 0.55;
    link(hp, lp, shape, g);
  } else if (voice.fx === "robot") {
    const ring = c.createGain(); ring.gain.value = 0; const lfo = c.createOscillator(); lfo.frequency.value = 68; lfo.connect(ring.gain); lfo.start();
    const boost = c.createGain(); boost.gain.value = 1.6; link(ring, boost);
  } else if (voice.fx === "echo") {
    const dry = c.createGain(); dry.gain.value = 1; src.connect(dry).connect(out); chain.push(dry);
    const d = c.createDelay(1); d.delayTime.value = 0.26; const fb = c.createGain(); fb.gain.value = 0.42; const wet = c.createGain(); wet.gain.value = 0.55;
    src.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(out); chain.push(d, fb, wet);
  } else if (voice.fx === "monkey") {
    try {
      shifterReady ??= c.audioWorklet.addModule(URL.createObjectURL(new Blob([SHIFTER], { type: "application/javascript" })));
      await shifterReady;
      if (voice.fx !== "monkey" || !ctx) return;
      const node = new AudioWorkletNode(c, "pitch-up"), hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 220;
      link(node, hp);
    } catch { link(); }
  } else link();
}

/** Join voice: the microphone (asked for now), its effect, then a connection to each talker already on. */
export async function joinVoice() {
  if (voice.on || voice.joining) return;
  voice.joining = true; voice.error = ""; voice.full = false; bump();
  try {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    ctx = new AudioContext(); if (ctx.state === "suspended") await ctx.resume();
    src = ctx.createMediaStreamSource(mic); out = ctx.createMediaStreamDestination();
    meter = ctx.createAnalyser(); meter.fftSize = 1024; src.connect(meter);
    await wire();
    voice.on = true; voice.joining = false; gate();
    net.onVoice = sync; net.onRtc = (from, data) => void signal(from, data);
    net.onVoiceFull = () => { voice.full = true; leaveVoice(); voice.full = true; bump(); };
    net.onWelcome = () => { if (voice.on) { closeAll(); sendVoice(true); } };
    sendVoice(true);
    timer = setInterval(watch, 120);
  } catch (e) {
    voice.joining = false;
    voice.error = (e as DOMException)?.name === "NotAllowedError" ? "Microphone blocked. Allow it in the browser's settings to talk." : "No microphone found.";
    stopMic();
  }
  bump();
}

export function leaveVoice() {
  if (voice.on) sendVoice(false);
  voice.on = false; voice.joining = false; voice.holding = false; voice.meTalking = false;
  closeAll(); stopMic();
  if (timer) { clearInterval(timer); timer = null; }
  net.onVoice = undefined; net.onRtc = undefined; net.onVoiceFull = undefined; net.onWelcome = undefined;
  bump();
}

function stopMic() {
  mic?.getTracks().forEach((t) => t.stop()); mic = null;
  void ctx?.close(); ctx = null; src = null; out = null; meter = null; chain = []; shifterReady = null;
}

export function setVoiceFx(fx: VoiceFx) { voice.fx = fx; void wire(); bump(); }
export function setOpenMic(open: boolean) { voice.open = open; gate(); bump(); }
/** The talk key (hold to talk; with an open mic it mutes instead). */
export function holdTalk(on: boolean) { voice.holding = on; gate(); bump(); }
export function toggleMute(id: number) { if (voice.muted.has(id)) voice.muted.delete(id); else voice.muted.add(id); const p = voice.peers.get(id); if (p) p.audio.muted = voice.muted.has(id); bump(); }

/** Whether your voice goes out now: an open mic unless the key is held to mute it; hold to talk while it's held. */
function gate() {
  const live = voice.on && (voice.open ? !voice.holding : voice.holding);
  out?.stream.getAudioTracks().forEach((t) => { t.enabled = live; });
}

/** Someone talking (for the HUD, and to duck the game's sound). */
export function anyoneTalking() {
  if (!voice.on) return false;
  for (const [id, p] of voice.peers) if (p.talking && !voice.muted.has(id)) return true;
  return false;
}

function watch() {
  const live = voice.on && (voice.open ? !voice.holding : voice.holding);
  const me = !!meter && live && level(meter) > TALKING;
  let changed = me !== voice.meTalking; voice.meTalking = me;
  for (const p of voice.peers.values()) { const t = !!p.level && level(p.level) > TALKING; if (t !== p.talking) { p.talking = t; changed = true; } }
  if (changed) bump();
}

/** The talkers changed: connect to new ones (the lower id offers), drop those who left. */
function sync() {
  if (!voice.on) return;
  const ids = net.voiceIds.filter((id) => id !== net.id);
  for (const [id] of voice.peers) if (!ids.includes(id)) close(id);
  for (const id of ids) if (!voice.peers.has(id) && net.id < id) void offer(id);
  bump();
}

function peer(id: number) {
  let p = voice.peers.get(id);
  if (p) return p;
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const audio = new Audio(); audio.autoplay = true; (audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true; audio.muted = voice.muted.has(id);
  p = { pc, audio, level: null, queued: [], state: "connecting", talking: false };
  voice.peers.set(id, p);
  out?.stream.getAudioTracks().forEach((t) => pc.addTrack(t, out!.stream));
  pc.onicecandidate = (e) => { if (e.candidate) sendRtc(id, { ice: e.candidate.toJSON() }); };
  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    audio.srcObject = stream; void audio.play().catch(() => {});
    if (ctx) { try { const a = ctx.createAnalyser(); a.fftSize = 1024; ctx.createMediaStreamSource(stream).connect(a); p!.level = a; } catch {} }
  };
  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    p!.state = s === "connected" ? "live" : s === "failed" ? "failed" : p!.state;
    // a dropped link: start again (the lower id offers)
    if (s === "failed" && voice.on && net.voiceIds.includes(id)) { close(id); if (net.id < id) setTimeout(() => { if (voice.on && !voice.peers.has(id)) void offer(id); }, 1500); }
    bump();
  };
  return p;
}

async function offer(id: number) {
  const p = peer(id);
  const o = await p.pc.createOffer();
  await p.pc.setLocalDescription(o);
  sendRtc(id, { sdp: p.pc.localDescription });
}

async function signal(from: number, data: unknown) {
  if (!voice.on || !net.voiceIds.includes(from)) return;
  const d = data as { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit };
  try {
    if (d.sdp) {
      if (d.sdp.type === "offer" && voice.peers.has(from) && voice.peers.get(from)!.pc.signalingState !== "stable") close(from); // a crossed offer: theirs wins
      const p = peer(from);
      await p.pc.setRemoteDescription(d.sdp);
      for (const c of p.queued.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
      if (d.sdp.type === "offer") { const a = await p.pc.createAnswer(); await p.pc.setLocalDescription(a); sendRtc(from, { sdp: p.pc.localDescription }); }
    } else if (d.ice) {
      const p = voice.peers.get(from);
      if (!p) return;
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(d.ice).catch(() => {}); else p.queued.push(d.ice);
    }
  } catch { /* a stale message */ }
}

function close(id: number) {
  const p = voice.peers.get(id); if (!p) return;
  p.pc.close(); p.audio.srcObject = null; voice.peers.delete(id); bump();
}
function closeAll() { for (const id of [...voice.peers.keys()]) close(id); }
