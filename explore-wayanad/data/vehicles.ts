/**
 * Every vehicle the site has, for the /vehicles page and (for those marked inTraffic) the road traffic.
 * Sizes in metres (traffic scales each model to them); speed is lib/traffic's relative cruising speed.
 * "model" vehicles are GLB files in public/models/traffic (see its ATTRIBUTION.md); "built" ones are made in code by
 * lib/keralaVehicles.ts.
 */
export type VehicleEntry = {
  id: string;
  label: string;
  kind: "model" | "built";
  /** GLB path for "model", builder id (lib/keralaVehicles BUILDERS) for "built" */
  source: string;
  size: { length: number; width: number; height: number };
  speed: number;
  inTraffic: boolean;
  credit: string;
  note: string;
  /** real models keep their proportions: scaled evenly so the length matches (others are stretched to the size box) */
  fit?: "uniform";
  /** radians about the vertical, applied before fitting, so the model's front faces +Z */
  yaw?: number;
};

export const VEHICLE_REGISTRY: VehicleEntry[] = [
  // in traffic now (added with Codex, 2026-10-19)
  { id: "bus", label: "Bus (simple)", kind: "model", source: "/models/traffic/bus.glb", size: { length: 9.4, width: 2.8, height: 3.1 }, speed: 0.62, inTraffic: false, credit: "Script-generated for this project (scripts/bake-traffic.mjs)", note: "Low-poly box bus, red/yellow and green/cream." },
  { id: "sedan", label: "Sedan", kind: "model", source: "/models/traffic/sedan.glb", size: { length: 4.4, width: 1.8, height: 1.45 }, speed: 0.8, inTraffic: false, credit: "Car by Quaternius, CC0 (poly.pizza)", note: "Generic low-poly car." },
  { id: "suv", label: "SUV", kind: "model", source: "/models/traffic/suv.glb", size: { length: 4.6, width: 1.9, height: 1.8 }, speed: 0.76, inTraffic: false, credit: "SUV by Quaternius, CC0 (poly.pizza)", note: "Generic low-poly SUV." },
  { id: "motorcycle", label: "Motorcycle (simple)", kind: "model", source: "/models/traffic/motorcycle.glb", size: { length: 2.0, width: 0.7, height: 1.85 }, speed: 0.72, inTraffic: false, credit: "Script-generated for this project", note: "Simple bike with a helmeted rider." },
  { id: "truck", label: "Truck", kind: "model", source: "/models/traffic/truck.glb", size: { length: 7.2, width: 2.4, height: 3.0 }, speed: 0.56, inTraffic: false, credit: "Car Kit by Kenney, CC0", note: "Stylised toy-like truck." },
  { id: "scooter", label: "Scooter (simple)", kind: "model", source: "/models/traffic/scooter.glb", size: { length: 1.9, width: 0.7, height: 1.8 }, speed: 0.62, inTraffic: false, credit: "Script-generated for this project", note: "Simple scooter with a rider." },
  { id: "van", label: "Van", kind: "model", source: "/models/traffic/van.glb", size: { length: 5.2, width: 2.0, height: 2.35 }, speed: 0.65, inTraffic: false, credit: "Car Kit by Kenney, CC0", note: "Stylised toy-like van." },
  // realistic models from Sketchfab, CC BY 4.0 (2026-10-20): the traffic now. Sizes follow each model (scaled evenly)
  { id: "ksrtc-real", label: "KSRTC bus (real model)", kind: "model", source: "/models/traffic/ksrtc-real.glb", size: { length: 9.4, width: 2.25, height: 2.62 }, speed: 0.62, inTraffic: true, credit: "“KSRTC Bus 2011” by BML Palms Authority, CC BY 4.0 (Sketchfab); repainted", note: "Ashok Leyland-style ordinary bus with photo textures, repainted to Kerala state transport colours: red body, yellow sill line, cream roof. Passengers at the windows, a driver in khaki, LED route board (Kozhikode in Malayalam and English). Badge removed; made-up Kerala plate." },
  { id: "privatebus-real", label: "Private bus (real model)", kind: "model", source: "/models/traffic/privatebus-real.glb", size: { length: 9.4, width: 2.25, height: 2.62 }, speed: 0.66, inTraffic: true, credit: "“KSRTC Bus 2011” by BML Palms Authority, CC BY 4.0 (Sketchfab); repainted", note: "The same photo-textured bus in a Kozhikode–Wayanad private livery: deep blue, orange sill line, white top. Passengers and driver at the windows; route board in Malayalam and English." },
  { id: "wagonr-real", label: "WagonR-style hatchback", kind: "model", source: "/models/traffic/wagonr-real.glb", size: { length: 3.6, width: 1.71, height: 1.69 }, speed: 0.8, inTraffic: true, credit: "“2013 Suzuki WagonR” by BHP3D, CC BY 4.0 (Sketchfab)", note: "Tall small hatchback, one of the most common cars in Kerala. Simplified for the web." },
  { id: "innova-real", label: "Innova-style MPV (taxi)", kind: "model", source: "/models/traffic/innova-real.glb", size: { length: 4.58, width: 2.08, height: 1.68 }, speed: 0.76, inTraffic: true, credit: "“Toyota Innova 2008” by Hoàng Huy, CC BY 4.0 (Sketchfab)", note: "The seven-seater most Kerala tourist taxis use." },
  { id: "lorry-real", label: "Decorated lorry", kind: "model", source: "/models/traffic/lorry-real.glb", size: { length: 7.8, width: 2.71, height: 3.24 }, speed: 0.52, inTraffic: true, credit: "“Indian Truck” by AFJAL ANSARI, CC BY 4.0 (Sketchfab)", note: "Tata-style goods lorry with painted cab and wooden body. Simplified, small textures, no normal maps." },
  { id: "rider-bike-real", label: "Motorcycle with rider", kind: "model", source: "/models/traffic/rider-bike-real.glb", size: { length: 2.1, width: 1.02, height: 1.28 }, speed: 0.72, inTraffic: true, credit: "“Motorcycle with rider” by sohanmajhi749, CC BY 4.0 (Sketchfab)", note: "Roadster with a helmeted rider." },
  { id: "auto-real", label: "Auto-rickshaw (real model)", kind: "model", source: "/models/traffic/auto-real.glb", size: { length: 2.65, width: 1.46, height: 1.7 }, speed: 0.55, inTraffic: true, credit: "“Auto Rickshaw” by rSquare, CC BY 4.0 (Sketchfab)", note: "Yellow and black three-wheeler." },
  { id: "omni-real", label: "Omni-style van", kind: "model", source: "/models/traffic/omni-real.glb", size: { length: 3.4, width: 1.74, height: 1.71 }, speed: 0.65, inTraffic: true, credit: "“Maruti Suzuki Omni” by BML Palms Authority, CC BY 4.0 (Sketchfab)", note: "Small boxy van." },
  { id: "enfield-real", label: "Royal Enfield-style classic", kind: "model", source: "/models/traffic/enfield-real.glb", size: { length: 2.14, width: 0.66, height: 1.16 }, speed: 0.7, inTraffic: false, credit: "“Royal enfield classic 350” by Mansoor, CC BY 4.0 (Sketchfab)", note: "Classic 350 shape. No rider in the model, so not in traffic yet. Simplified to 6%." },
  { id: "pulsar-real", label: "Commuter motorcycle", kind: "model", source: "/models/traffic/pulsar-real.glb", size: { length: 2.0, width: 0.93, height: 1.29 }, speed: 0.72, inTraffic: false, credit: "“Pulsar 135 Ls 2” by e-restrepo1114, CC BY 4.0 (Sketchfab)", note: "Commuter bike. No rider in the model, so not in traffic yet." },
  { id: "brezza-player", label: "Your car: Brezza-style compact SUV", kind: "model", source: "/models/traffic/brezza-player.glb", size: { length: 4.0, width: 2.02, height: 1.68 }, speed: 0, inTraffic: false, credit: "“2022 Maruti Suzuki Vitara Brezza” by BHP3D, CC BY 4.0 (Sketchfab)", note: "The car you drive on /drive: full interior, separate wheels and steering wheel. Simplified to 8 %." },
  // new Kerala vehicles, built in code (2026-10-20) — not in traffic until chosen
  { id: "ksrtc-bus", label: "State transport bus", kind: "built", source: "ksrtc-bus", size: { length: 11, width: 2.5, height: 3.4 }, speed: 0.6, inTraffic: false, credit: "Built in code for this project", note: "Kerala state-transport style fast passenger: red with a yellow band, destination board, roof rails. Generic livery, no operator marks." },
  { id: "private-bus", label: "Private bus", kind: "built", source: "private-bus", size: { length: 11, width: 2.5, height: 3.4 }, speed: 0.64, inTraffic: false, credit: "Built in code for this project", note: "Brightly painted private bus, white with sea-green and orange." },
  { id: "auto-rickshaw", label: "Auto-rickshaw", kind: "built", source: "auto-rickshaw", size: { length: 2.65, width: 1.4, height: 1.85 }, speed: 0.55, inTraffic: false, credit: "Built in code for this project", note: "Three-wheeler: yellow body, black canvas canopy." },
  { id: "jeep", label: "Open jeep", kind: "built", source: "jeep", size: { length: 4.0, width: 1.85, height: 2.0 }, speed: 0.7, inTraffic: false, credit: "Built in code for this project", note: "The estate / safari jeep: flat bonnet, round lamps, canvas top, spare on the back." },
  { id: "lorry", label: "Goods lorry", kind: "built", source: "lorry", size: { length: 8.7, width: 2.5, height: 3.0 }, speed: 0.52, inTraffic: false, credit: "Built in code for this project", note: "Decorated orange cab, slatted cargo body under tarpaulin, HORN OK PLEASE." },
  { id: "hatchback-taxi", label: "Hatchback taxi", kind: "built", source: "hatchback-taxi", size: { length: 3.85, width: 1.8, height: 1.62 }, speed: 0.8, inTraffic: false, credit: "Built in code for this project", note: "Small white hatchback with a taxi roof sign." },
  { id: "classic-motorcycle", label: "Classic motorcycle", kind: "built", source: "classic-motorcycle", size: { length: 2.1, width: 0.75, height: 1.9 }, speed: 0.72, inTraffic: false, credit: "Built in code for this project", note: "Round tank, chrome engine, rider in a helmet." },
];
