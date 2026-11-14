/**
 * The look and sound of the emergency vehicles in traffic (components/scene/Traffic: the Kerala Police patrol and the
 * ambulance) and the rockfall reel's rescue (components/scene/Rockfall): a roof bar of red and blue lamps that flash
 * in turn with a soft halo each, lettering on the sides, a red cross, and the ambulance's siren (Web Audio, made here:
 * a wail sweeping up and down, louder the nearer it is; off with the game's sound).
 */
import {
  AdditiveBlending, BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry,
  Sprite, SpriteMaterial, SRGBColorSpace,
} from "three";
import { horn } from "@/lib/horn";

/** Soft round glow (lamp halos, dust). */
let glowTex: CanvasTexture | null = null;
export function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return (glowTex = new CanvasTexture(c));
}

/** A roof bar `width` wide (units): red and blue lamps with halos. `flash(t, on)`: alternating double-flash, or dark. */
export function lightBar(width: number, halo = 0.28) {
  const bar = new Group(); bar.name = "light-bar";
  const base = new Mesh(new BoxGeometry(width, 0.008, 0.028), new MeshStandardMaterial({ color: "#222", roughness: 0.6 }));
  bar.add(base);
  const lamps = (["#ff2020", "#2050ff"] as const).map((col, i) => {
    const lamp = new Mesh(new BoxGeometry(width * 0.45, 0.012, 0.03), new MeshBasicMaterial({ color: col }));
    lamp.position.set((i ? 1 : -1) * width * 0.25, 0.008, 0);
    const glowSprite = new Sprite(new SpriteMaterial({ map: glow(), color: col, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    glowSprite.scale.setScalar(halo); lamp.add(glowSprite);
    bar.add(lamp);
    return { lamp, glowSprite, col: new Color(col) };
  });
  return {
    bar,
    flash: (t: number, on = true) => lamps.forEach((l, i) => {
      const lit = on && Math.floor(t * 6 + i * 3) % 6 < 3;
      (l.lamp.material as MeshBasicMaterial).color.copy(l.col).multiplyScalar(lit ? 1 : on ? 0.08 : 0.25);
      l.glowSprite.material.opacity = lit ? 0.9 : 0; l.glowSprite.visible = lit; // (unlit: not drawn at all)
    }),
  };
}

/** Lettering for a vehicle's side: a canvas texture on a plane `w` × `h` units (`paper` null: just the letters). */
export function label(text: string, w: number, h: number, ink: string, paper: string | null, stripe?: string, mirror = false) {
  const c = document.createElement("canvas"); c.width = 1024; c.height = Math.max(32, Math.round(1024 * h / w));
  const g = c.getContext("2d")!;
  if (paper) { g.fillStyle = paper; g.fillRect(0, 0, c.width, c.height); }
  if (stripe) { g.fillStyle = stripe; g.fillRect(0, c.height * 0.78, c.width, c.height * 0.22); }
  if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.fillStyle = ink; g.font = `800 ${Math.round(c.height * 0.62)}px Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height * (stripe ? 0.42 : 0.52));
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 8;
  return new Mesh(new PlaneGeometry(w, h), new MeshStandardMaterial({ map: tex, transparent: !paper, roughness: 0.5 }));
}

/** A red cross on white, `size` units square. */
export function redCross(size: number) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 128);
  g.fillStyle = "#d81e1e"; g.fillRect(44, 14, 40, 100); g.fillRect(14, 44, 100, 40);
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
  return new Mesh(new PlaneGeometry(size, size), new MeshStandardMaterial({ map: tex, roughness: 0.5 }));
}

/** You're driving the police jeep or the ambulance (PlayerCar): its siren goes, and the traffic ahead pulls over. */
export const own = { siren: false };

/**
 * The ambulance siren: one wail for the nearest ambulance, `level` 0 (silent) … 1 (right beside you), set each frame.
 * Made only once there's sound (the game's sound switched on); eased, so it swells and fades as it comes and goes.
 */
let ctx: AudioContext | null = null, out: GainNode | null = null;
export function siren(level: number) {
  if (!horn.sound) { if (out && ctx) out.gain.setTargetAtTime(0, ctx.currentTime, 0.1); return; }
  if (level <= 0.001 && !out) return;
  if (!ctx) {
    ctx = new AudioContext();
    out = ctx.createGain(); out.gain.value = 0;
    const tone = ctx.createOscillator(), over = ctx.createOscillator(), sweep = ctx.createOscillator(), depth = ctx.createGain(), depth2 = ctx.createGain();
    tone.type = "sawtooth"; over.type = "square"; tone.frequency.value = 960; over.frequency.value = 1920;
    sweep.type = "triangle"; sweep.frequency.value = 0.55; depth.gain.value = 340; depth2.gain.value = 680;
    sweep.connect(depth).connect(tone.frequency); sweep.connect(depth2).connect(over.frequency);
    const soft = ctx.createBiquadFilter(); soft.type = "lowpass"; soft.frequency.value = 2600;
    const mixTone = ctx.createGain(), mixOver = ctx.createGain(); mixTone.gain.value = 0.16; mixOver.gain.value = 0.03;
    tone.connect(mixTone).connect(soft); over.connect(mixOver).connect(soft); soft.connect(out).connect(ctx.destination);
    tone.start(); over.start(); sweep.start();
  }
  if (ctx.state === "suspended") void ctx.resume();
  out!.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.55, ctx.currentTime, 0.25);
}
