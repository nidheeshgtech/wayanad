/**
 * The cars a player can drive, and their paint colours. No maker names anywhere players see: each car is named after
 * a place in Wayanad. The models (CC BY, Sketchfab — public/models/traffic/ATTRIBUTION.md) have their badges taken
 * off and WAYANAD on the plates (scripts/retouch/player-*.mjs). They all handle the same for now (lib/game CAR); each
 * is drawn at its own length. `paint`: the body-paint materials the colour goes on (glass, lights, tyres keep theirs).
 */
export type CarId = "lakkidi" | "vythiri" | "kabini" | "banasura" | "pookode";
export type ColourId = "white" | "black" | "red" | "blue" | "green" | "yellow" | "silver" | "orange";
export type Car = { id: CarId; name: string; kind: string; file: string; length: number; paint: RegExp };

export const CARS: Car[] = [
  { id: "lakkidi", name: "Lakkidi", kind: "Compact SUV", file: "/models/traffic/player-suv.glb", length: 4.0, paint: /^primary$/ },
  { id: "vythiri", name: "Vythiri", kind: "Hatchback", file: "/models/traffic/player-hatch.glb", length: 3.99, paint: /^primary$/ },
  { id: "kabini", name: "Kabini", kind: "Sedan", file: "/models/traffic/player-sedan.glb", length: 3.99, paint: /^primary$/ },
  { id: "banasura", name: "Banasura", kind: "Off-road 4×4", file: "/models/traffic/player-4x4.glb", length: 4.66, paint: /^primary$/ },
  { id: "pookode", name: "Pookode", kind: "Family MPV", file: "/models/traffic/player-mpv.glb", length: 4.4, paint: /^primary$/ },
];

/** Paint: a little less saturated than a swatch would suggest, as car paint reads under the scene's light. */
export const COLOURS: { id: ColourId; name: string; hex: string }[] = [
  { id: "white", name: "White", hex: "#eceeec" },
  { id: "black", name: "Black", hex: "#16181b" },
  { id: "red", name: "Red", hex: "#a3161c" },
  { id: "blue", name: "Blue", hex: "#1d4b94" },
  { id: "green", name: "Green", hex: "#2c5a39" },
  { id: "yellow", name: "Yellow", hex: "#dcab2b" },
  { id: "silver", name: "Silver", hex: "#b4b8bd" },
  { id: "orange", name: "Orange", hex: "#d45f1e" },
];

export type Choice = { car: CarId; colour: ColourId };
export const DEFAULT_CHOICE: Choice = { car: "lakkidi", colour: "white" };
export const carOf = (id: string) => CARS.find((c) => c.id === id) ?? CARS[0];
export const colourOf = (id: string) => COLOURS.find((c) => c.id === id) ?? COLOURS[0];

const KEY = "wayanad-car";
/** The car and colour chosen last time on this device. */
export function savedChoice(): Choice {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && CARS.some((c) => c.id === v.car) && COLOURS.some((c) => c.id === v.colour)) return v;
  } catch {}
  return DEFAULT_CHOICE;
}
export function saveChoice(c: Choice) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} }
