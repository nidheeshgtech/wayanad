/**
 * The cars a player can drive, and their paint colours. No maker names anywhere players see: each car goes by its
 * type. (The ids are older names, kept because saved choices and the room server use them.) The models (CC BY, Sketchfab — public/models/traffic/ATTRIBUTION.md) have their badges taken
 * off and WAYANAD on the plates (scripts/retouch/player-*.mjs). They all handle the same for now (lib/game CAR); each
 * is drawn at its own length. `paint`: the body-paint materials the colour goes on (glass, lights, tyres keep theirs).
 */
export type CarId = "lakkidi" | "vythiri" | "kabini" | "banasura" | "pookode";
export type ColourId = "white" | "black" | "red" | "blue" | "green" | "yellow" | "silver" | "orange";
/** `plate`: where the number plates are in the model (a part, by its name in the file, or a material): the rear one
 * (the part's faces behind the middle of the car) gets the driver's name over it (components/drive/PlayerCar). A model
 * with no rear plate gives `at`: its height off the road and size, metres; it goes on the back of the car there. */
export type Plate = { part?: string; material?: string; at?: { y: number; w: number; h: number } };
export type Car = { id: CarId; name: string; file: string; length: number; paint: RegExp; plate: Plate };

export const CARS: Car[] = [
  { id: "lakkidi", name: "Compact SUV", file: "/models/traffic/player-suv.glb", length: 4.0, paint: /^primary$/, plate: { material: "plate_bg.0" } },
  { id: "vythiri", name: "Hatchback", file: "/models/traffic/player-hatch.glb", length: 3.99, paint: /^primary$/, plate: { part: "plate_reflector.1_0" } },
  { id: "kabini", name: "Sedan", file: "/models/traffic/player-sedan.glb", length: 3.99, paint: /^primary$/, plate: { part: "boot_grille.2_0" } },
  { id: "banasura", name: "Off-road 4×4", file: "/models/traffic/player-4x4.glb", length: 4.66, paint: /^primary$/, plate: { part: "boot_scorpio_n_ext_1.2_0" } },
  { id: "pookode", name: "Family MPV", file: "/models/traffic/player-mpv.glb", length: 4.4, paint: /^primary$/, plate: { at: { y: 0.8, w: 0.5, h: 0.12 } } }, // (its file has only a front plate)
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
