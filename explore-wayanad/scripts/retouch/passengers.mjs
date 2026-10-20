// Passengers behind a bus's glass, painted into its texture: writes an SVG overlay (same size as the texture) of
// head-and-shoulder silhouettes in the given window panes, a driver and a front row in the windscreen.
//   node passengers.mjs <spec.json> <out.svg>
// spec: { size, seed, aspect?, panes: [[x0, x1, sill, top], ...], screen?: { x0, x1, sill, top, driverSide: "low" | "high", aspect?, driverShirt? } }
// aspect: texture pixels across per pixel up for the same distance on the bus (sides are stretched lengthwise)
// Rows in these textures run upward (sill < top): a head sits high in the pane, shoulders below it. Seeded, so a
// rebuild paints the same people. Dark, muted colours: seen through tinted glass at a distance.
import { readFileSync, writeFileSync } from "node:fs";

const [specFile, out] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specFile, "utf8"));
let seed = spec.seed ?? 7;
const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = (a) => a[Math.floor(r() * a.length)];
// behind tinted glass: muted, darkened colours (white shirts read as grey)
const SHIRTS = ["#8d8a82", "#26354d", "#4d2427", "#2d3f2b", "#7a6634", "#323238", "#9a968c", "#3c2c47", "#5a3e22"];
let aspect = spec.aspect ?? 1.5;
const HAIR = ["#141110", "#1c1714", "#2a2420", "#3a3a3a"];
const shapes = [];

function person(cx, sill, top, scale = 1, shirtColour) {
  const h = top - sill, headR = Math.max(3, h * 0.125 * scale), headY = sill + h * (0.7 + (r() - 0.5) * 0.08) * Math.min(1, scale + 0.1);
  const shoulderW = headR * 3.6 * aspect, shoulderTop = headY - headR * 1.25, shirt = shirtColour ?? pick(SHIRTS);
  // shoulders and chest down to the sill (rows run upward: lower y is lower on the bus)
  shapes.push(`<rect x="${(cx - shoulderW / 2).toFixed(1)}" y="${sill.toFixed(1)}" width="${shoulderW.toFixed(1)}" height="${(shoulderTop - sill).toFixed(1)}" rx="${(headR * 0.9 * aspect).toFixed(1)}" fill="${shirt}"/>`);
  shapes.push(`<ellipse cx="${cx.toFixed(1)}" cy="${(headY - headR * 0.9).toFixed(1)}" rx="${(headR * 0.45 * aspect).toFixed(1)}" ry="${(headR * 0.5).toFixed(1)}" fill="#3f2b1f"/>`); // neck
  shapes.push(`<ellipse cx="${cx.toFixed(1)}" cy="${headY.toFixed(1)}" rx="${(headR * 0.75 * aspect).toFixed(1)}" ry="${headR.toFixed(1)}" fill="#4a3324"/>`); // face
  shapes.push(`<ellipse cx="${cx.toFixed(1)}" cy="${(headY + headR * 0.35).toFixed(1)}" rx="${(headR * 0.8 * aspect).toFixed(1)}" ry="${(headR * 0.72).toFixed(1)}" fill="${pick(HAIR)}"/>`); // hair, on top
}

for (const [x0, x1, sill, top] of spec.panes) {
  const w = x1 - x0, n = w > 45 ? (r() < 0.75 ? 2 : 1) : (r() < 0.6 ? 1 : 0);
  for (let i = 0; i < n; i++) person(x0 + w * (n === 1 ? 0.3 + r() * 0.4 : (i + 0.5) / n + (r() - 0.5) * 0.08), sill, top, 0.95 + r() * 0.12);
}
if (spec.screen) {
  const { x0, x1, sill, top, driverSide } = spec.screen, w = x1 - x0;
  aspect = spec.screen.aspect ?? aspect;
  // front row first (further back, smaller), then the driver in front of them
  for (const f of [0.55, 0.72, 0.88]) if (r() < 0.8) person(x0 + w * (driverSide === "low" ? f : 1 - f), sill, sill + (top - sill) * 0.72, 0.6);
  person(x0 + w * (driverSide === "low" ? 0.24 : 0.76), sill, sill + (top - sill) * 0.9, 0.85, spec.screen.driverShirt); // driver
}
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.size}" height="${spec.size}">${shapes.join("")}</svg>`);
console.log(`passengers: ${shapes.length / 4} figures`);
