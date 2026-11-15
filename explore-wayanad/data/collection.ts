/**
 * The vehicle collection (app/cars): every vehicle on the Drive Wayanad road, as cards with stats a kid can compare.
 * Stats come from how each one drives in the game (data/cars handling, lib/game CAR / BIKE / HEAVY): top speed in
 * km/h, and pickup, handling and size as 1–10. No maker names anywhere players see (data/cars). `soon`: a model we
 * have that isn't on the road yet. `play`: how you get to drive it — your garage, or waved down in the traffic.
 */
import { BORROWABLE, CARS, type CarId } from "./cars";

export type VehicleClass = "car" | "suv" | "bike" | "heavy" | "emergency" | "kerala";
export const CLASSES: { id: VehicleClass; name: string; icon: string }[] = [
  { id: "car", name: "Cars", icon: "🚗" },
  { id: "suv", name: "SUVs & 4×4", icon: "🚙" },
  { id: "bike", name: "Bikes", icon: "🏍️" },
  { id: "kerala", name: "Kerala specials", icon: "🛺" },
  { id: "heavy", name: "Buses & lorries", icon: "🚌" },
  { id: "emergency", name: "Emergency", icon: "🚨" },
];

export type Entry = {
  id: string; name: string; type: string; cls: VehicleClass;
  /** the 3D model and how to show it: a car from data/cars (painted as in the game), or a model file */
  car?: CarId; file?: string; length: number; paint?: string;
  topSpeed: number; pickup: number; handling: number; size: number; seats: number;
  play: "garage" | "traffic" | "soon";
  fact: string;
};

// game handling → 1–10 scores: pickup from acceleration (units/s²), handling from the turning radius (smaller is nimbler)
const pickupOf = (accel: number) => Math.max(1, Math.min(10, Math.round((accel / 0.66) * 10)));
const handlingOf = (rMin: number) => Math.max(1, Math.min(10, Math.round(10 - (rMin - 0.4) * 14)));
const sizeOf = (metres: number) => Math.max(1, Math.min(10, Math.round(metres / 0.95)));
const KMH = 36;

function fromGame(id: CarId) {
  const c = [...CARS, ...BORROWABLE].find((x) => x.id === id)!;
  const bike = !!c.bike, heavy = !!c.heavy;
  const max = c.handling?.max ?? (heavy ? 1.7 : 2.8), accel = c.handling?.accel ?? (bike ? 0.66 : heavy ? 0.3 : 0.55);
  const rMin = bike ? 0.4 : heavy ? 0.95 : 0.52;
  return { car: id, length: c.length, topSpeed: Math.round((max * KMH) / 5) * 5, pickup: pickupOf(accel), handling: handlingOf(rMin), size: sizeOf(c.length) };
}

export const COLLECTION: Entry[] = [
  { id: "cruiser", name: "Churam Cruiser", type: "Compact SUV", cls: "suv", ...fromGame("lakkidi"), seats: 5, play: "garage", paint: "#eceeec",
    fact: "The car most drivers start the churam in. It climbs all nine hairpins from Adivaram to the Lakkidi gate: 12.5 km of road, up to about 700 m above the sea." },
  { id: "zip", name: "Vythiri Zip", type: "Hatchback", cls: "car", ...fromGame("vythiri"), seats: 5, play: "garage", paint: "#a3161c",
    fact: "Small and quick to turn: it slips round the tight hairpins where a bus has to take the whole road." },
  { id: "glide", name: "Kabini Glide", type: "Sedan", cls: "car", ...fromGame("kabini"), seats: 5, play: "garage", paint: "#1d4b94",
    fact: "Named after the Kabini river, which flows out of Wayanad into Karnataka." },
  { id: "beast", name: "Banasura Beast", type: "Off-road 4×4", cls: "suv", ...fromGame("banasura"), seats: 7, play: "garage", paint: "#2c5a39",
    fact: "Named after Banasura Sagar, one of the biggest earth dams in India, up in Wayanad." },
  { id: "family", name: "Pookode Family", type: "Family MPV", cls: "car", ...fromGame("pookode"), seats: 7, play: "garage", paint: "#1d4b94",
    fact: "Seven seats for the whole family's trip to Pookode Lake, where you can row a boat." },
  { id: "thump", name: "Chembra Thump", type: "Classic bike", cls: "bike", ...fromGame("chembra"), seats: 2, play: "garage", paint: "#16181b",
    fact: "A heavy old-style bike with a deep thump. Riders lean into the bends; in the game, so do you." },
  { id: "dart", name: "Kuruva Dart", type: "Street bike", cls: "bike", ...fromGame("kuruva"), seats: 2, play: "garage", paint: "#d45f1e",
    fact: "The quickest off the line of everything here: bikes pick up faster than cars." },
  { id: "tallboy", name: "Tall-boy Hatch", type: "Hatchback", cls: "car", ...fromGame("t-hatch"), seats: 5, play: "traffic", paint: "#d2d6d8",
    fact: "A tall little car you see everywhere in Kerala. Wave one down on the churam and drive it away!" },
  { id: "seven", name: "Highway Seven", type: "MPV", cls: "car", ...fromGame("t-mpv"), seats: 7, play: "traffic",
    fact: "The taxi families hire for a trip to the hills. Look for it in the traffic going up and down." },
  { id: "van", name: "Little Van", type: "Van", cls: "kerala", ...fromGame("t-van"), seats: 7, play: "traffic", paint: "#c93a32",
    fact: "A tiny van with the engine under the seats. Small enough for the narrowest village roads." },
  { id: "auto", name: "Auto Chettan", type: "Auto-rickshaw", cls: "kerala", ...fromGame("t-auto"), seats: 4, play: "traffic",
    fact: "Three wheels, one headlight and a meter. Take one and the driver shouts “Meter ittitt po!” — put the meter on and go!" },
  { id: "aanavandi", name: "Aanavandi", type: "KSRTC bus", cls: "heavy", ...fromGame("t-bus"), seats: 49, play: "traffic",
    fact: "Keralites call the state bus “Aanavandi”, the elephant vehicle, for the two elephants in its badge." },
  { id: "rocket", name: "Private Bus", type: "Private bus", cls: "heavy", ...fromGame("t-pbus"), seats: 45, play: "traffic",
    fact: "Bright colours, a loud horn and a board in front saying where it's going: in Malayalam and English." },
  { id: "coach", name: "Tourist Coach", type: "Tourist bus", cls: "heavy", ...fromGame("t-tbus"), seats: 45, play: "traffic",
    fact: "Brings visitors up to Wayanad's waterfalls, caves and tea estates. Tall, with big windows to look out of." },
  { id: "lorry", name: "Painted Lorry", type: "Lorry", cls: "heavy", ...fromGame("t-lorry"), seats: 2, play: "traffic",
    fact: "The slowest climber on the churam: loaded lorries crawl up the hairpins. Overtake carefully!" },
  { id: "police", name: "Police Jeep", type: "Kerala Police", cls: "emergency", ...fromGame("t-police"), seats: 7, play: "traffic", paint: "#f2f3f1",
    fact: "Red and blue lights on the roof. Drive it and the traffic pulls over for you. In the app, take it and the police chase you!" },
  { id: "ambulance", name: "Ambulance", type: "Ambulance", cls: "emergency", ...fromGame("t-amb"), seats: 4, play: "traffic", paint: "#f2f3f1",
    fact: "Hear the siren? Every vehicle on the road moves aside to let it through first." },
  { id: "wagon", name: "Estate Wagon", type: "Station wagon", cls: "car", file: "/models/traffic/suv.glb", length: 4.6, topSpeed: 95, pickup: pickupOf(0.5), handling: handlingOf(0.55), size: sizeOf(4.6), seats: 5, play: "soon",
    fact: "Coming soon to the churam: a long car with a big boot for planters' trips between the estates and town." },
  { id: "taxi", name: "Town Taxi", type: "Sedan", cls: "car", file: "/models/traffic/sedan.glb", length: 4.4, topSpeed: 95, pickup: pickupOf(0.5), handling: handlingOf(0.52), size: sizeOf(4.4), seats: 5, play: "soon",
    fact: "Coming soon: the taxi that waits at Kalpetta and Sulthan Bathery for visitors off the bus." },
  { id: "villagebus", name: "Village Bus", type: "Old bus", cls: "heavy", file: "/models/traffic/bus.glb", length: 9.0, topSpeed: 55, pickup: pickupOf(0.22), handling: handlingOf(0.95), size: sizeOf(9), seats: 40, play: "soon",
    fact: "Coming soon: an old bus that stops at every village. Wave your hand and it waits for you!" },
];

/** A power tier from the top speed, as racing games show it: S, A, B, C. */
export const tierOf = (e: Entry) => (e.topSpeed >= 100 ? "S" : e.topSpeed >= 85 ? "A" : e.topSpeed >= 65 ? "B" : "C");
