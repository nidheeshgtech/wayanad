import type { ActId } from "./acts";

/**
 * What the photo view shows in each act, until real footage replaces it.
 * `from` / `to` are act progress 0–1, or a road mark resolved at runtime ("bend3" = the 3rd hairpin, "arch" = Lakkidi gateway).
 * `move` is the slow camera drift across the photo: [scale, x, y] at the start and end of the shot,
 * x / y in -1..1 of the slack the scale leaves (0 = centred, 1 = the right / bottom edge in view).
 */
export type Mark = number | `bend${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | "arch";
export type Shot = { photo: string; from: Mark; to: Mark; move: [[number, number, number], [number, number, number]] };

export const STORY: Partial<Record<ActId, Shot[]>> = {
  churam: [
    { photo: "churam-barrier", from: 0, to: "bend3", move: [[1.18, -0.6, 0.4], [1.04, 0.4, 0]] },
    { photo: "churam-hairpins", from: "bend3", to: "bend6", move: [[1.22, 0.6, -0.3], [1.06, -0.5, 0.2]] },
    { photo: "churam-cliff", from: "bend6", to: "bend9", move: [[1.06, 0, 0], [1.24, 0.5, 0.3]] }, // pushing in as the fog closes
    { photo: "lakkidi-arch", from: "bend9", to: "arch", move: [[1.0, 0, 0.2], [1.28, 0, -0.1]] }, // drive at the arch
    { photo: "lakkidi-valley", from: "arch", to: 1, move: [[1.25, 0, -0.6], [1.02, 0, 0.3]] }, // lift and look back down the valley
  ],
  kalpetta: [
    { photo: "pookode", from: 0, to: 0.5, move: [[1.15, -0.5, 0], [1.05, 0.5, 0]] },
    { photo: "kalpetta", from: 0.5, to: 1, move: [[1.2, -0.8, 0], [1.2, 0.8, 0]] }, // wide panorama: pan across the hub
  ],
  soochipara: [
    { photo: "soochipara", from: 0, to: 1, move: [[1.3, 0, 0.9], [1.3, 0, -0.9]] }, // vertical subject: tilt up the fall
  ],
  kuruva: [
    { photo: "kuruva", from: 0, to: 1, move: [[1.2, 0.4, 0], [1.04, -0.3, 0]] },
  ],
  edakkal: [
    { photo: "edakkal", from: 0, to: 1, move: [[1.0, 0, 0], [1.35, 0.2, -0.2]] }, // the carvings resolve as you move in
  ],
  forest: [
    { photo: "muthanga-road", from: 0, to: 0.45, move: [[1.04, 0, 0], [1.22, 0, 0.1]] },
    { photo: "elephants", from: 0.45, to: 0.7, move: [[1.12, 0.3, 0], [1.14, 0.3, 0]] }, // the hold: nearly still
    { photo: "muthanga-road", from: 0.7, to: 1, move: [[1.22, 0, 0.1], [1.32, 0, 0.1]] },
  ],
  border: [
    { photo: "bathery-road", from: 0, to: 1, move: [[1.2, 0, 0.3], [1.04, 0, -0.2]] },
  ],
  stay: [
    { photo: "vythiri-tea", from: 0, to: 1, move: [[1.04, 0, 0.4], [1.18, 0, -0.3]] },
  ],
  night: [
    { photo: "churam-night", from: 0, to: 1, move: [[1.1, 0, 0], [1.2, 0, 0]] },
  ],
};
