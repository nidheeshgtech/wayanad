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
};

export const VEHICLE_REGISTRY: VehicleEntry[] = [
  // in traffic now (added with Codex, 2026-10-19)
  { id: "bus", label: "Bus (simple)", kind: "model", source: "/models/traffic/bus.glb", size: { length: 9.4, width: 2.8, height: 3.1 }, speed: 0.62, inTraffic: true, credit: "Script-generated for this project (scripts/bake-traffic.mjs)", note: "Low-poly box bus, red/yellow and green/cream." },
  { id: "sedan", label: "Sedan", kind: "model", source: "/models/traffic/sedan.glb", size: { length: 4.4, width: 1.8, height: 1.45 }, speed: 0.8, inTraffic: true, credit: "Car by Quaternius, CC0 (poly.pizza)", note: "Generic low-poly car." },
  { id: "suv", label: "SUV", kind: "model", source: "/models/traffic/suv.glb", size: { length: 4.6, width: 1.9, height: 1.8 }, speed: 0.76, inTraffic: true, credit: "SUV by Quaternius, CC0 (poly.pizza)", note: "Generic low-poly SUV." },
  { id: "motorcycle", label: "Motorcycle (simple)", kind: "model", source: "/models/traffic/motorcycle.glb", size: { length: 2.0, width: 0.7, height: 1.85 }, speed: 0.72, inTraffic: true, credit: "Script-generated for this project", note: "Simple bike with a helmeted rider." },
  { id: "truck", label: "Truck", kind: "model", source: "/models/traffic/truck.glb", size: { length: 7.2, width: 2.4, height: 3.0 }, speed: 0.56, inTraffic: true, credit: "Car Kit by Kenney, CC0", note: "Stylised toy-like truck." },
  { id: "scooter", label: "Scooter (simple)", kind: "model", source: "/models/traffic/scooter.glb", size: { length: 1.9, width: 0.7, height: 1.8 }, speed: 0.62, inTraffic: true, credit: "Script-generated for this project", note: "Simple scooter with a rider." },
  { id: "van", label: "Van", kind: "model", source: "/models/traffic/van.glb", size: { length: 5.2, width: 2.0, height: 2.35 }, speed: 0.65, inTraffic: true, credit: "Car Kit by Kenney, CC0", note: "Stylised toy-like van." },
  // new Kerala vehicles, built in code (2026-10-20) — not in traffic until chosen
  { id: "ksrtc-bus", label: "State transport bus", kind: "built", source: "ksrtc-bus", size: { length: 11, width: 2.5, height: 3.4 }, speed: 0.6, inTraffic: false, credit: "Built in code for this project", note: "Kerala state-transport style fast passenger: red with a yellow band, destination board, roof rails. Generic livery, no operator marks." },
  { id: "private-bus", label: "Private bus", kind: "built", source: "private-bus", size: { length: 11, width: 2.5, height: 3.4 }, speed: 0.64, inTraffic: false, credit: "Built in code for this project", note: "Brightly painted private bus, white with sea-green and orange." },
  { id: "auto-rickshaw", label: "Auto-rickshaw", kind: "built", source: "auto-rickshaw", size: { length: 2.65, width: 1.4, height: 1.85 }, speed: 0.55, inTraffic: false, credit: "Built in code for this project", note: "Three-wheeler: yellow body, black canvas canopy." },
  { id: "jeep", label: "Open jeep", kind: "built", source: "jeep", size: { length: 4.0, width: 1.85, height: 2.0 }, speed: 0.7, inTraffic: false, credit: "Built in code for this project", note: "The estate / safari jeep: flat bonnet, round lamps, canvas top, spare on the back." },
  { id: "lorry", label: "Goods lorry", kind: "built", source: "lorry", size: { length: 8.7, width: 2.5, height: 3.0 }, speed: 0.52, inTraffic: false, credit: "Built in code for this project", note: "Decorated orange cab, slatted cargo body under tarpaulin, HORN OK PLEASE." },
  { id: "hatchback-taxi", label: "Hatchback taxi", kind: "built", source: "hatchback-taxi", size: { length: 3.85, width: 1.8, height: 1.62 }, speed: 0.8, inTraffic: false, credit: "Built in code for this project", note: "Small white hatchback with a taxi roof sign." },
  { id: "classic-motorcycle", label: "Classic motorcycle", kind: "built", source: "classic-motorcycle", size: { length: 2.1, width: 0.75, height: 1.9 }, speed: 0.72, inTraffic: false, credit: "Built in code for this project", note: "Round tank, chrome engine, rider in a helmet." },
];
