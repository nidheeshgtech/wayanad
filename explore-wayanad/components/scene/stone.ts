import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

/**
 * Random rubble masonry, tiling: irregular stones in dark mortar. `weathered` darkens it with the vertical rain streaks
 * and green-black moss of the churam's retaining walls (as in drone footage of the hairpins); plain is the cleaner
 * stonework of the Lakkidi gateway's piers.
 */
export function rubble({ weathered = false, seed = 7 } = {}) {
  const c = document.createElement("canvas"); c.width = c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = weathered ? "#2f302b" : "#4b4a45"; ctx.fillRect(0, 0, 512, 512);
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 12; row++) for (let col = 0; col < 7; col++) {
    const w = 60 + r() * 40, h = 36 + r() * 16, x = col * 76 + (row % 2) * 38 + r() * 8, y = row * 44 + r() * 6;
    const g = (weathered ? 85 : 120) + r() * 60, tint = r() * 18;
    ctx.fillStyle = `rgb(${g + tint},${g + tint * 0.6},${g - 6})`;
    for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
      ctx.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2, rr = 0.82 + r() * 0.18;
        ctx.lineTo(x + dx + w / 2 + Math.cos(a) * (w / 2) * rr, y + dy + h / 2 + Math.sin(a) * (h / 2) * rr);
      }
      ctx.closePath(); ctx.fill();
    }
  }
  if (weathered) {
    // rain streaks running down, and patches of moss
    for (let k = 0; k < 90; k++) {
      const x = r() * 512, w = 2 + r() * 10, top = r() * 512, len = 60 + r() * 300;
      const g = ctx.createLinearGradient(0, top, 0, top + len);
      g.addColorStop(0, "rgba(15,18,14,0)"); g.addColorStop(0.3, `rgba(15,18,14,${0.25 + r() * 0.3})`); g.addColorStop(1, "rgba(15,18,14,0)");
      ctx.fillStyle = g;
      for (const dy of [-512, 0]) ctx.fillRect(x, top + dy, w, len);
    }
    for (let k = 0; k < 40; k++) {
      const x = r() * 512, y = r() * 512, rad = 10 + r() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(58,82,40,${0.35 + r() * 0.3})`); g.addColorStop(1, "rgba(58,82,40,0)");
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 8;
  return t;
}
