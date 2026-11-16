/**
 * Wheel motion blur. A wheel turning faster than a spoke's width a frame can't be drawn turning — to the eye it stands
 * still, crawls or turns backwards (the wagon-wheel effect) — so it used to be held to a slow, clean spin, and at speed
 * the car's wheels looked lazy. Now they turn at their true rate, and over each one's outer face a disc fades in with
 * the spin: the tyre a dark ring, the rim a smeared metal blur with faint rings, the hub darker — what a fast wheel
 * looks like on camera. Players' cars (components/drive/PlayerCar) and the traffic (components/scene/Traffic).
 */
import { CanvasTexture, CircleGeometry, DoubleSide, Mesh, MeshStandardMaterial, SRGBColorSpace } from "three";

let tex: CanvasTexture | null = null;
function blurTexture() {
  if (tex) return tex;
  const S = 256, c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d")!, R = S / 2;
  const ring = (r0: number, r1: number, fill: string | CanvasGradient) => { g.beginPath(); g.arc(R, R, r1 * R, 0, Math.PI * 2); g.arc(R, R, r0 * R, 0, Math.PI * 2, true); g.fillStyle = fill; g.fill(); };
  // the tyre: dark rubber, its sidewall a touch lighter toward the rim
  const tyre = g.createRadialGradient(R, R, 0.74 * R, R, R, R); tyre.addColorStop(0, "rgba(40,40,42,1)"); tyre.addColorStop(0.35, "rgba(22,22,24,1)"); tyre.addColorStop(1, "rgba(12,12,13,1)");
  ring(0.76, 0.995, tyre);
  // the rim: smeared metal (the spokes a blur), brighter at the lip, with faint concentric rings
  const rim = g.createRadialGradient(R, R, 0.28 * R, R, R, 0.76 * R);
  rim.addColorStop(0, "rgba(70,72,76,0.92)"); rim.addColorStop(0.55, "rgba(118,121,126,0.86)"); rim.addColorStop(0.9, "rgba(150,153,158,0.9)"); rim.addColorStop(1, "rgba(60,62,66,1)");
  ring(0.28, 0.76, rim);
  for (const [r, a] of [[0.4, 0.18], [0.52, 0.12], [0.64, 0.16]] as const) { g.beginPath(); g.arc(R, R, r * R, 0, Math.PI * 2); g.strokeStyle = `rgba(30,32,36,${a})`; g.lineWidth = 3; g.stroke(); }
  // the hub, and its cap
  ring(0.1, 0.28, "rgba(48,50,54,0.95)");
  ring(0, 0.1, "rgba(150,152,156,0.95)");
  tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
const geo = new CircleGeometry(1, 40);
/** A blur disc of radius `r`, facing +x (add it at the wheel's outer face; turn it for the other side). */
export function blurDisc(r: number, material: MeshStandardMaterial) {
  const m = new Mesh(geo, material); m.scale.setScalar(r * 0.985); m.rotation.y = Math.PI / 2; m.name = "wheel-blur"; m.renderOrder = 2; m.visible = false;
  return m;
}
export function blurMaterial(opacity = 0) {
  return new MeshStandardMaterial({ map: blurTexture(), transparent: true, opacity, depthWrite: false, roughness: 0.45, metalness: 0.4, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
}
/** How much blur for a wheel turning `w` radians a second: none below ~14 (about 18 km/h on a car), most by ~45. */
export const blurFor = (w: number) => Math.min(0.9, Math.max(0, (Math.abs(w) - 14) / 31) * 0.9);
