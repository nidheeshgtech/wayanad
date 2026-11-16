/**
 * Wheel motion blur. A wheel turning faster than a spoke's width a frame can't be drawn turning — to the eye it stands
 * still, crawls or turns backwards (the wagon-wheel effect) — so it used to be held to a slow, clean spin, and at speed
 * the car's wheels looked lazy. Now they turn at their true rate, and over each one's outer face a disc fades in with
 * the spin over the rim (the tyre stays its own): a see-through smear of the spokes, faint rings, the hub darker — what a fast wheel
 * looks like on camera. Players' cars (components/drive/PlayerCar) and the traffic (components/scene/Traffic).
 */
import { CanvasTexture, CircleGeometry, DoubleSide, Mesh, MeshStandardMaterial, SRGBColorSpace } from "three";

let tex: CanvasTexture | null = null;
function blurTexture() {
  if (tex) return tex;
  const S = 256, c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d")!, R = S / 2;
  const ring = (r0: number, r1: number, fill: string | CanvasGradient) => { g.beginPath(); g.arc(R, R, r1 * R, 0, Math.PI * 2); g.arc(R, R, r0 * R, 0, Math.PI * 2, true); g.fillStyle = fill; g.fill(); };
  // (the tyre stays the model's own — a flat disc over it read as a grey plate from any angle — so only the rim is
  // blurred: a see-through smear of the spokes, a little lighter at the lip, faint rings, the hub darker)
  const rim = g.createRadialGradient(R, R, 0.26 * R, R, R, 0.72 * R);
  rim.addColorStop(0, "rgba(64,66,70,0.62)"); rim.addColorStop(0.5, "rgba(96,99,104,0.5)"); rim.addColorStop(0.88, "rgba(120,123,128,0.52)"); rim.addColorStop(1, "rgba(60,62,66,0)");
  ring(0.26, 0.72, rim);
  for (const [r, a] of [[0.4, 0.14], [0.55, 0.1]] as const) { g.beginPath(); g.arc(R, R, r * R, 0, Math.PI * 2); g.strokeStyle = `rgba(30,32,36,${a})`; g.lineWidth = 3; g.stroke(); }
  ring(0.08, 0.26, "rgba(44,46,50,0.7)");
  ring(0, 0.08, "rgba(140,142,146,0.75)");
  tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
const geo = new CircleGeometry(1, 40);
/** A blur disc for a wheel of radius `r`, facing +x: add it at the rim's face (a little inside the tyre's sidewall,
 * RIM_INSET of the radius), turned for the other side. */
export const RIM_INSET = 0.1;
export function blurDisc(r: number, material: MeshStandardMaterial) {
  const m = new Mesh(geo, material); m.scale.setScalar(r * 0.985); m.rotation.y = Math.PI / 2; m.name = "wheel-blur"; m.renderOrder = 2; m.visible = false;
  return m;
}
export function blurMaterial(opacity = 0) {
  return new MeshStandardMaterial({ map: blurTexture(), transparent: true, opacity, depthWrite: false, roughness: 0.45, metalness: 0.4, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
}
/** How much blur for a wheel turning `w` radians a second: none below ~14 (about 18 km/h on a car), most by ~45. */
export const blurFor = (w: number) => Math.min(0.85, Math.max(0, (Math.abs(w) - 14) / 31) * 0.85);
