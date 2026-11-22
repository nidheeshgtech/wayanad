/**
 * The new garage, in preview (app/cars/new): vehicles that aren't in the game yet, for the owner to pick from.
 * Models: Sketchfab, CC BY (credit in `by`, and in public/models/garage/ATTRIBUTION.md), fetched with
 * scripts/fetch-sketchfab.mjs into public/models/garage. No maker names anywhere players see: each goes by a name of
 * its own and its type. `length`: real length, metres. `smoke`: its exhaust smoke's colour (every vehicle its own).
 * `turn`: the file faces backwards (−z): turned round. `seat`: the driver's eye, metres from the middle of the car on
 * the ground (x + left, y up, z + forward) for the inside view. Stats are for the game: top speed km/h, the rest 1–10.
 */
export type GarageClass = "super" | "muscle" | "offroad" | "truck" | "bike";
export const GARAGE_CLASSES: { id: GarageClass; name: string }[] = [
  { id: "super", name: "Sports" },
  { id: "muscle", name: "Muscle" },
  { id: "offroad", name: "Off-road" },
  { id: "truck", name: "4×4 & trucks" },
  { id: "bike", name: "Bikes" },
];

export type NewRide = {
  id: string; name: string; type: string; cls: GarageClass; file: string; length: number; smoke: string;
  topSpeed: number; pickup: number; handling: number; by: string;
  turn?: boolean; yaw?: number; crop?: [number, number]; seat?: [number, number, number]; note?: string;
};

const f = (id: string) => `/models/garage/${id}.glb`;

export const NEW_RIDES: NewRide[] = [
  // sports
  { id: "g-930", name: "Thamarassery Turbo", type: "Classic turbo coupe", cls: "super", file: f("g-930"), length: 4.29, smoke: "#ffb347", topSpeed: 125, pickup: 8, handling: 7, by: "Lionsharp Studios" },
  { id: "g-e30", name: "Kalpetta Kicker", type: "Touring coupe", cls: "super", file: f("g-e30"), length: 4.35, smoke: "#ff4d4d", topSpeed: 115, pickup: 7, handling: 8, by: "TinoD2" },
  { id: "g-gullwing", name: "Gullwing Ghat", type: "Gullwing classic", cls: "super", file: f("g-gullwing"), length: 4.52, smoke: "#bfe3ff", topSpeed: 110, pickup: 6, handling: 6, by: "Lexyc16" },
  { id: "g-nsx", name: "Pookode Phantom", type: "Mid-engine coupe", cls: "super", file: f("g-nsx"), length: 4.4, smoke: "#b388ff", topSpeed: 125, pickup: 8, handling: 9, seat: [0.33, 0.95, -0.6], by: "Lexyc16" },
  { id: "g-rx7", name: "Rotary Rain", type: "Sports coupe", cls: "super", file: f("g-rx7"), length: 4.3, smoke: "#f5f5f5", topSpeed: 120, pickup: 8, handling: 8, seat: [0.33, 0.95, -0.3], by: "myedsu" },
  { id: "g-r34", name: "Banasura Blue", type: "Street racer", cls: "super", file: f("g-r34"), length: 4.6, smoke: "#4fc3f7", topSpeed: 130, pickup: 9, handling: 8, by: "Lexyc16" },
  { id: "g-integrale", name: "Rally Raja", type: "Rally hatch", cls: "super", file: f("g-integrale"), length: 3.9, smoke: "#00e5ff", topSpeed: 115, pickup: 8, handling: 9, by: "begemot.988888" },
  { id: "g-saba", name: "Wayanad V12", type: "'90s V12 supercar", cls: "super", file: f("g-saba"), length: 4.5, smoke: "#ff9e80", topSpeed: 135, pickup: 9, handling: 8, turn: true, by: "DanielZhabotinsky" },
  // muscle
  { id: "g-palomino", name: "Pony 67", type: "'60s pony car", cls: "muscle", file: f("g-palomino"), length: 4.6, smoke: "#40c4ff", topSpeed: 120, pickup: 8, handling: 6, turn: true, by: "DanielZhabotinsky" },
  { id: "g-phoenix", name: "Mananthavady Muscle", type: "'70s muscle car", cls: "muscle", file: f("g-phoenix"), length: 4.9, smoke: "#ff6d00", topSpeed: 120, pickup: 8, handling: 5, turn: true, by: "DanielZhabotinsky" },
  { id: "g-firebird", name: "Lakkidi Screamer", type: "'70s muscle car", cls: "muscle", file: f("g-firebird"), length: 4.8, smoke: "#ffd600", topSpeed: 125, pickup: 8, handling: 5, by: "everhard" },
  { id: "g-malibu", name: "Vythiri V8", type: "'60s muscle car", cls: "muscle", file: f("g-malibu"), length: 5.0, smoke: "#e0e0e0", topSpeed: 115, pickup: 7, handling: 5, turn: true, by: "joko_p" },
  { id: "g-duke", name: "Edakkal Thunder", type: "'60s muscle car", cls: "muscle", file: f("g-duke"), length: 5.2, smoke: "#ff1744", topSpeed: 120, pickup: 8, handling: 4, turn: true, by: "DanielZhabotinsky" },
  { id: "g-hotrod", name: "Hairpin Hot Rod", type: "Hot rod", cls: "muscle", file: f("g-hotrod"), length: 4.0, smoke: "#76ff03", topSpeed: 110, pickup: 9, handling: 5, turn: true, by: "DanielZhabotinsky" },
  // off-road
  { id: "g-baja", name: "Mud Monkey", type: "Dune buggy", cls: "offroad", file: f("g-baja"), length: 3.6, smoke: "#8bc34a", topSpeed: 100, pickup: 8, handling: 8, by: "duanesmind" },
  { id: "g-quad", name: "Quad Kutty", type: "ATV quad", cls: "offroad", file: f("g-quad"), length: 1.9, smoke: "#ff9100", topSpeed: 80, pickup: 9, handling: 9, turn: true, by: "Res1n" },
  // 4×4 and trucks
  { id: "g-bokaroo", name: "Safari 67", type: "Safari 4×4", cls: "truck", file: f("g-bokaroo"), length: 4.3, smoke: "#80cbc4", topSpeed: 90, pickup: 5, handling: 6, turn: true, by: "DanielZhabotinsky" },
  { id: "g-gaz", name: "Chembra Trekker", type: "Classic 4×4", cls: "truck", file: f("g-gaz"), length: 3.85, smoke: "#9e9e9e", topSpeed: 80, pickup: 4, handling: 6, by: "petar.gachev" },
  { id: "g-king", name: "Kotta King", type: "Armoured SUV", cls: "truck", file: f("g-king"), length: 6.0, smoke: "#37474f", topSpeed: 95, pickup: 5, handling: 3, by: "Lexyc16" },
  { id: "g-rancher", name: "Estate Lifter", type: "Lifted pickup", cls: "truck", file: f("g-rancher"), length: 4.8, smoke: "#c6ff00", topSpeed: 95, pickup: 6, handling: 4, turn: true, seat: [0.37, 1.55, 0.2], by: "DanielZhabotinsky" },
  { id: "g-c10", name: "Planter Pickup", type: "Classic pickup", cls: "truck", file: f("g-c10"), length: 4.8, smoke: "#a1887f", topSpeed: 95, pickup: 5, handling: 5, seat: [0.37, 1.38, 0.15], by: "roh3d" },
  // bikes
  { id: "b-r1", name: "Churam Blade", type: "Superbike", cls: "bike", file: f("b-r1"), length: 2.06, smoke: "#2979ff", topSpeed: 140, pickup: 10, handling: 9, turn: true, by: "ejsnowy" },
  { id: "b-v4r", name: "Red Hairpin", type: "Superbike", cls: "bike", file: f("b-v4r"), length: 2.1, smoke: "#ff1744", topSpeed: 140, pickup: 10, handling: 9, by: "IrfanMuaz" },
  { id: "b-gsxr", name: "Silver Streak", type: "Superbike", cls: "bike", file: f("b-gsxr"), length: 2.04, smoke: "#e0f7fa", topSpeed: 135, pickup: 9, handling: 9, turn: true, by: "Res1n" },
  { id: "b-triple", name: "Triple Threat", type: "Naked street bike", cls: "bike", file: f("b-triple"), length: 2.08, smoke: "#ffea00", topSpeed: 125, pickup: 9, handling: 9, turn: true, by: "jamie3d" },
  { id: "b-z1000", name: "Jungle Fighter", type: "Naked street bike", cls: "bike", file: f("b-z1000"), length: 2.1, smoke: "#76ff03", topSpeed: 125, pickup: 9, handling: 8, turn: true, by: "EmanuelRestrepoVelez" },
  { id: "b-125", name: "Town Runner", type: "Commuter bike", cls: "bike", file: f("b-125"), length: 2.0, smoke: "#b0bec5", topSpeed: 90, pickup: 6, handling: 8, by: "drydoctoregg" },
  { id: "b-cafe", name: "Cafe Kalpetta", type: "Café racer", cls: "bike", file: f("b-cafe"), length: 2.05, smoke: "#ffcc80", topSpeed: 110, pickup: 7, handling: 8, turn: true, by: "milinam2002" },
  { id: "b-chopper", name: "Long Fork", type: "Chopper", cls: "bike", file: f("b-chopper"), length: 2.6, smoke: "#ff6e40", topSpeed: 105, pickup: 7, handling: 4, by: "UnforgettableName" },
  { id: "b-cruiser", name: "Highway Tusker", type: "Cruiser", cls: "bike", file: f("b-cruiser"), length: 2.4, smoke: "#bcaaa4", topSpeed: 110, pickup: 7, handling: 5, by: "alpha_0816" },
  { id: "b-dualsport", name: "Trail Tiger", type: "Dual-sport", cls: "bike", file: f("b-dualsport"), length: 2.1, smoke: "#ffab00", topSpeed: 100, pickup: 7, handling: 8, by: "EmanuelRestrepoVelez" },
  { id: "b-dirt", name: "Mud Rocket", type: "Dirt bike", cls: "bike", file: f("b-dirt"), length: 2.15, smoke: "#40c4ff", topSpeed: 95, pickup: 9, handling: 9, turn: true, by: "csharp122705" },
];
export const rideOf = (id: string) => NEW_RIDES.find((r) => r.id === id);
