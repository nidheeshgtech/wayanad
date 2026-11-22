/**
 * The new garage, in preview (app/cars/new): vehicles that aren't in the game yet, for the owner to pick from.
 * Models: Sketchfab, CC BY (credit in `by`, and in public/models/garage/ATTRIBUTION.md), fetched with
 * scripts/fetch-sketchfab.mjs into public/models/garage. No maker names anywhere players see: each goes by a name of
 * its own and its type. `length`: real length, metres. `smoke`: its exhaust smoke's colour (every vehicle its own).
 * `turn`: the file faces backwards (−z): turned round. `seat`: the driver's eye, metres from the middle of the car on
 * the ground (x + left, y up, z + forward) for the inside view. Stats are for the game: top speed km/h, the rest 1–10.
 */
import type { Clean } from "@/lib/debadge";

export type GarageClass = "super" | "muscle" | "offroad" | "truck" | "bike" | "heli";
export const GARAGE_CLASSES: { id: GarageClass; name: string }[] = [
  { id: "super", name: "Sports" },
  { id: "muscle", name: "Muscle" },
  { id: "offroad", name: "Off-road" },
  { id: "truck", name: "4×4 & trucks" },
  { id: "bike", name: "Bikes" },
  { id: "heli", name: "Helicopters" },
];

export type NewRide = {
  id: string; name: string; type: string; cls: GarageClass; file: string; length: number; smoke: string;
  topSpeed: number; pickup: number; handling: number; by: string;
  turn?: boolean; yaw?: number; crop?: [number, number];
  /** the file sits nose-up (a bike on its stand): tipped forward by this much, radians, so both wheels touch the floor */
  pitch?: number;
  /** maker badges, names and plates taken off (lib/debadge) */
  clean?: Clean;
  /** a helicopter's tail rotor, where the finder misses it: hub height, place along, radius (m, as placed) */
  tail?: [number, number, number];
  /** …and its main rotor, by part or material name, where the blades droop too much to be found */
  main?: string;
  /** …and where its mast is (x, z), when the blades aren't evenly spread in the file */
  hub?: [number, number];
  /** a helicopter's pilot's eye, metres behind its nose (1.9 if not given) */
  cockpit?: number; seat?: [number, number, number]; note?: string;
};

const f = (id: string) => `/models/garage/${id}.glb`;

export const NEW_RIDES: NewRide[] = [
  // sports
  { id: "g-930", name: "Thamarassery Turbo", type: "Classic turbo coupe", cls: "super", file: f("g-930"), length: 4.29, smoke: "#ffb347", topSpeed: 125, pickup: 8, handling: 7, clean: { hide: ["coat", "930_stickers"], blank: ["plate"], cut: [{ at: [0.203, 0.703, -1.741], r: 0.16 }, { at: [0.174, 0.593, 1.911], r: 0.07 }, { at: [0, 0.593, 1.911], r: 0.07 }] }, by: "Lionsharp Studios" },
  { id: "g-e30", name: "Kalpetta Kicker", type: "Touring coupe", cls: "super", file: f("g-e30"), length: 4.35, smoke: "#ff4d4d", topSpeed: 115, pickup: 7, handling: 8, clean: { hide: ["BMW_E30_M3_EMBLEMS"], paint: [{ mat: "BMW_E30_M3_RIM", uv: [0.26, 0.41, 0.56, 0.71] }], cut: [{ at: [0.205, 0.598, 2.057], r: 0.08 }, { at: [-0.583, 0.777, -2.068], r: 0.09 }, { at: [0.79, 0.31, 1.41], r: 0.07 }, { at: [-0.79, 0.31, 1.41], r: 0.07 }, { at: [0.8, 0.31, -1.18], r: 0.07 }, { at: [-0.8, 0.31, -1.18], r: 0.07 }] }, by: "TinoD2" },
  { id: "g-gullwing", name: "Gullwing Ghat", type: "Gullwing classic", cls: "super", file: f("g-gullwing"), length: 4.52, smoke: "#bfe3ff", topSpeed: 110, pickup: 6, handling: 6, clean: { cut: [{ at: [0, 0.45, 2.19], r: 0.17, mat: "chrome", tri: true }, { at: [0, 0.705, -1.921], r: 0.05, mat: "chrome", tri: true }, { at: [-0.021, 0.659, -1.986], r: 0.12 }, { at: [0.78, 0.34, 1.48], r: 0.07, mat: "chrome", tri: true }, { at: [0.78, 0.34, -0.93], r: 0.07, mat: "chrome", tri: true }, { at: [-0.78, 0.34, 1.48], r: 0.07, mat: "chrome", tri: true }, { at: [-0.78, 0.34, -0.93], r: 0.07, mat: "chrome", tri: true }] }, by: "Lexyc16" },
  { id: "g-nsx", name: "Pookode Phantom", type: "Mid-engine coupe", cls: "super", file: f("g-nsx"), length: 4.4, smoke: "#b388ff", topSpeed: 125, pickup: 8, handling: 9, seat: [0.33, 0.95, -0.6], clean: { paint: [{ mat: "Material.016", uv: [0.435, 0.29, 0.585, 0.335] }, { mat: "Material.009", uv: [0.462, 0.532, 0.518, 0.588] }] }, by: "Lexyc16" },
  { id: "g-rx7", name: "Rotary Rain", type: "Sports coupe", cls: "super", file: f("g-rx7"), length: 4.3, smoke: "#f5f5f5", topSpeed: 120, pickup: 8, handling: 8, seat: [0.33, 0.95, -0.3], clean: { hide: ["text_color"], blank: ["numberplate"], cut: [{ at: [0.302, 0.538, 2.092], r: 0.14, mat: "chrome" }] }, by: "myedsu" },
  { id: "g-r34", name: "Banasura Blue", type: "Street racer", cls: "super", file: f("g-r34"), length: 4.6, smoke: "#4fc3f7", topSpeed: 130, pickup: 9, handling: 8, clean: { cut: [{ at: [0, 0.617, 2.213], r: 0.07 }, { at: [0, 0.819, -2.206], r: 0.06 }, { at: [-0.241, 0.78, -2.203], r: 0.07 }] }, by: "Lexyc16" },
  { id: "g-integrale", name: "Rally Raja", type: "Rally hatch", cls: "super", file: f("g-integrale"), length: 3.9, smoke: "#00e5ff", topSpeed: 115, pickup: 8, handling: 9, clean: { hide: ["Logo", "Shield_2", "Red_Suns", "Legend", "Legion"], blank: ["Number"], paint: [{ mat: "Paint", uv: [0.42, 0.32, 0.86, 0.43] }, { mat: "Paint", uv: [0.79, 0.27, 0.89, 0.63] }, { mat: "Tire", uv: [0.2, 0, 0.8, 0.13] }, { mat: "Tire", uv: [0.14, 0.84, 0.86, 1] }, { mat: "material", uv: [0.88, 0.88, 1, 1] }] }, by: "begemot.988888" },
  { id: "g-saba", name: "Wayanad V12", type: "'90s V12 supercar", cls: "super", file: f("g-saba"), length: 4.5, smoke: "#ff9e80", topSpeed: 135, pickup: 9, handling: 8, turn: true, by: "DanielZhabotinsky" },
  // muscle
  { id: "g-palomino", name: "Pony 67", type: "'60s pony car", cls: "muscle", file: f("g-palomino"), length: 4.6, smoke: "#40c4ff", topSpeed: 120, pickup: 8, handling: 6, turn: true, by: "DanielZhabotinsky" },
  { id: "g-phoenix", name: "Mananthavady Muscle", type: "'70s muscle car", cls: "muscle", file: f("g-phoenix"), length: 4.9, smoke: "#ff6d00", topSpeed: 120, pickup: 8, handling: 5, turn: true, by: "DanielZhabotinsky" },
  { id: "g-firebird", name: "Lakkidi Screamer", type: "'70s muscle car", cls: "muscle", file: f("g-firebird"), length: 4.8, smoke: "#ffd600", topSpeed: 125, pickup: 8, handling: 5, clean: { hide: ["decals", "logo", "white"], blank: ["plate"] }, by: "everhard" },
  { id: "g-malibu", name: "Vythiri V8", type: "'60s muscle car", cls: "muscle", file: f("g-malibu"), length: 5.0, smoke: "#e0e0e0", topSpeed: 115, pickup: 7, handling: 5, turn: true, clean: { hide: ["Object_5", "Object_6", "Object_7", "Object_8", "Object_15", "Object_17", "Object_63"] }, by: "joko_p" },
  { id: "g-duke", name: "Edakkal Thunder", type: "'60s muscle car", cls: "muscle", file: f("g-duke"), length: 5.2, smoke: "#ff1744", topSpeed: 120, pickup: 8, handling: 4, turn: true, by: "DanielZhabotinsky" },
  { id: "g-hotrod", name: "Hairpin Hot Rod", type: "Hot rod", cls: "muscle", file: f("g-hotrod"), length: 4.0, smoke: "#76ff03", topSpeed: 110, pickup: 9, handling: 5, turn: true, by: "DanielZhabotinsky" },
  // off-road
  { id: "g-baja", name: "Mud Monkey", type: "Dune buggy", cls: "offroad", file: f("g-baja"), length: 3.6, smoke: "#8bc34a", topSpeed: 100, pickup: 8, handling: 8, by: "duanesmind" },
  { id: "g-quad", name: "Quad Kutty", type: "ATV quad", cls: "offroad", file: f("g-quad"), length: 1.9, smoke: "#ff9100", topSpeed: 80, pickup: 9, handling: 9, turn: true, by: "Res1n" },
  // 4×4 and trucks
  { id: "g-bokaroo", name: "Safari 67", type: "Safari 4×4", cls: "truck", file: f("g-bokaroo"), length: 4.3, smoke: "#80cbc4", topSpeed: 90, pickup: 5, handling: 6, turn: true, by: "DanielZhabotinsky" },
  { id: "g-gaz", name: "Chembra Trekker", type: "Classic 4×4", cls: "truck", file: f("g-gaz"), length: 3.85, smoke: "#9e9e9e", topSpeed: 80, pickup: 4, handling: 6, by: "petar.gachev" },
  { id: "g-king", name: "Kotta King", type: "Armoured SUV", cls: "truck", file: f("g-king"), length: 6.0, smoke: "#37474f", topSpeed: 95, pickup: 5, handling: 3, clean: { hide: ["logo"] }, by: "Lexyc16" },
  { id: "g-rancher", name: "Estate Lifter", type: "Lifted pickup", cls: "truck", file: f("g-rancher"), length: 4.8, smoke: "#c6ff00", topSpeed: 95, pickup: 6, handling: 4, turn: true, seat: [0.37, 1.55, 0.2], by: "DanielZhabotinsky" },
  // bikes
  { id: "b-v4r", name: "Red Hairpin", type: "Superbike", cls: "bike", file: f("b-v4r"), length: 2.1, smoke: "#ff1744", topSpeed: 140, pickup: 10, handling: 9, by: "IrfanMuaz" },
  { id: "b-gsxr", name: "Silver Streak", type: "Superbike", cls: "bike", file: f("b-gsxr"), length: 2.04, smoke: "#e0f7fa", topSpeed: 135, pickup: 9, handling: 9, turn: true, clean: { hide: ["Matte__FFB90000", "Matte__FF8C0000__spec"], cut: [{ at: [0.27, 0.64, 0.51], r: 0.12, mat: "Matte__FFFFFFFF" }, { at: [-0.27, 0.64, 0.51], r: 0.12, mat: "Matte__FFFFFFFF" }] }, by: "Res1n" },
  { id: "b-triple", name: "Triple Threat", type: "Naked street bike", cls: "bike", file: f("b-triple"), length: 2.08, smoke: "#ffea00", topSpeed: 125, pickup: 9, handling: 9, turn: true, by: "jamie3d" },
  { id: "b-z1000", name: "Jungle Fighter", type: "Naked street bike", cls: "bike", file: f("b-z1000"), length: 2.1, smoke: "#76ff03", topSpeed: 125, pickup: 9, handling: 8, turn: true, clean: { paint: [{ mat: "negromate", uv: [0, 0.03, 0.13, 0.29] }, { mat: "negromate", uv: [0.4, 0.18, 0.48, 0.32] }, { mat: "negrobrillante", uv: [0.1, 0.39, 0.15, 0.44] }, { mat: "negrobrillante", uv: [0.67, 0.43, 0.71, 0.47] }, { mat: "negrobrillante", uv: [0.82, 0.3, 0.86, 0.37] }, { mat: "negrobrillante", uv: [0.88, 0.22, 0.93, 0.25] }] }, by: "EmanuelRestrepoVelez" },
  { id: "b-125", name: "Town Runner", type: "Commuter bike", cls: "bike", file: f("b-125"), length: 2.0, smoke: "#b0bec5", topSpeed: 90, pickup: 6, handling: 8, pitch: 0.072, by: "drydoctoregg" },
  { id: "b-cafe", name: "Cafe Kalpetta", type: "Café racer", cls: "bike", file: f("b-cafe"), length: 2.05, smoke: "#ffcc80", topSpeed: 110, pickup: 7, handling: 8, turn: true, by: "milinam2002" },
  { id: "b-chopper", name: "Long Fork", type: "Chopper", cls: "bike", file: f("b-chopper"), length: 2.6, smoke: "#ff6e40", topSpeed: 105, pickup: 7, handling: 4, turn: true, pitch: 0.035, by: "UnforgettableName" },
  { id: "b-cruiser", name: "Highway Tusker", type: "Cruiser", cls: "bike", file: f("b-cruiser"), length: 2.4, smoke: "#bcaaa4", topSpeed: 110, pickup: 7, handling: 5, by: "alpha_0816" },
  { id: "b-dualsport", name: "Trail Tiger", type: "Dual-sport", cls: "bike", file: f("b-dualsport"), length: 2.1, smoke: "#ffab00", topSpeed: 100, pickup: 7, handling: 8, by: "EmanuelRestrepoVelez" },
  { id: "b-dirt", name: "Mud Rocket", type: "Dirt bike", cls: "bike", file: f("b-dirt"), length: 2.15, smoke: "#40c4ff", topSpeed: 95, pickup: 9, handling: 9, turn: true, by: "csharp122705" },
  // helicopters (rotors found and turned: lib/autoRotors; `smoke` here is the dust their downwash throws up)
  { id: "h-police", name: "Sky Patrol", type: "Police helicopter", cls: "heli", file: f("h-police"), length: 12.2, smoke: "#90caf9", topSpeed: 255, pickup: 7, handling: 8, tail: [2.03, -4.71, 0.62], clean: { paint: [{ mat: "BODY", uv: [0.19, 0.28, 0.25, 0.35] }, { mat: "BODY", uv: [0.44, 0.38, 0.49, 0.48] }, { mat: "BODY", uv: [0.24, 0.52, 0.33, 0.6] }, { mat: "BODY", uv: [0.43, 0.52, 0.49, 0.64] }, { mat: "BODY", uv: [0.1, 0.85, 0.4, 0.92] }, { mat: "BODY", uv: [0.12, 0.48, 0.26, 0.56] }, { mat: "BODY", uv: [0.28, 0.64, 0.42, 0.72] }, { mat: "BODY", uv: [0.03, 0.73, 0.22, 0.81] }, { mat: "BODY", uv: [0.165, 0.87, 0.2, 0.91] }, { mat: "BODY", uv: [0.68, 0.86, 0.72, 0.9] }, { mat: "BODY", uv: [0.29, 0.87, 0.37, 0.91] }] }, by: "solid3ddd" },
  { id: "h-private", name: "Plantation Flyer", type: "Private helicopter", cls: "heli", file: f("h-private"), length: 11.5, smoke: "#e0e0e0", topSpeed: 240, pickup: 6, handling: 8, tail: [1.94, -4.87, 0.6], by: "pranav27" },
  { id: "h-civil", name: "Tea Hopper", type: "Light helicopter", cls: "heli", file: f("h-civil"), length: 11, smoke: "#c5e1a5", topSpeed: 220, pickup: 7, handling: 9, tail: [3.4, -4.88, 1.1], cockpit: 2.4, by: "irs1182" },
  { id: "h-huey", name: "Red Cross Huey", type: "Rescue helicopter", cls: "heli", file: f("h-huey"), length: 17.5, smoke: "#ef9a9a", topSpeed: 220, pickup: 6, handling: 7, tail: [4.43, -7.16, 1.7], clean: { paint: [{ mat: "DefaultWhite_texture.png", uv: [0.41, 0.36, 0.51, 0.46] }, { mat: "DefaultWhite_texture.png", uv: [0.63, 0.57, 0.73, 0.63] }, { mat: "DefaultWhite_texture.png", uv: [0.27, 0.765, 0.37, 0.82] }, { mat: "DefaultWhite_texture.png", uv: [0.615, 0.42, 0.685, 0.49] }, { mat: "DefaultWhite_texture.png", uv: [0.46, 0.58, 0.56, 0.69] }, { mat: "DefaultWhite_texture.png", uv: [0.455, 0.76, 0.555, 0.87] }, { mat: "DefaultWhite_texture.png", uv: [0.32, 0.63, 0.48, 0.68] }, { mat: "DefaultWhite_texture.png", uv: [0.55, 0.81, 0.7, 0.86] }] }, cockpit: 2.9, by: "helijah" },
  { id: "h-ambulance", name: "Air Ambulance", type: "Air ambulance", cls: "heli", file: f("h-ambulance"), length: 11.6, smoke: "#ff8a80", topSpeed: 260, pickup: 7, handling: 8, main: "wings", clean: { paint: [{ mat: "exterior", uv: [0.55, 0.74, 0.72, 0.805] }, { mat: "exterior", uv: [0.55, 0.84, 0.72, 0.905] }, { mat: "exterior", uv: [0.21, 0.46, 0.35, 0.6] }, { mat: "exterior", uv: [0.71, 0.145, 0.87, 0.25] }, { mat: "exterior", uv: [0, 0.92, 0.05, 1] }, { mat: "doors", uv: [0, 0.02, 0.14, 0.135] }, { mat: "doors", uv: [0, 0.465, 0.18, 0.6] }] }, by: "pukkafilms" },
];
export const rideOf = (id: string) => NEW_RIDES.find((r) => r.id === id);
