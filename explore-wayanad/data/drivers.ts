/**
 * The drivers a player can be: seven people from the hills, our own cast (made for this game, not anyone from
 * another). Each is a rigged 3D model with a standing idle (public/models/drivers, made with Higgsfield image → 3D,
 * squeezed by scripts/prepare-drivers.mjs) and a portrait for the menus (public/drivers). Shown beside your car in the
 * garage, on the race podium, and next to your name in a friends room. The ids go to the room server (multiplayer/src).
 */
export type DriverId = "rider" | "guard" | "trekker" | "auto" | "racer" | "estate" | "mechanic";
export type Driver = { id: DriverId; name: string; role: string; height: number };

export const DRIVERS: Driver[] = [
  { id: "rider", name: "Arjun", role: "Churam rider", height: 1.78 },
  { id: "racer", name: "Zara", role: "Street racer", height: 1.66 },
  { id: "guard", name: "Varghese", role: "Forest guard", height: 1.76 },
  { id: "trekker", name: "Meera", role: "Trekker", height: 1.62 },
  { id: "auto", name: "Raghu", role: "Auto driver", height: 1.72 },
  { id: "mechanic", name: "Shibu", role: "Mechanic", height: 1.86 },
  { id: "estate", name: "Mathai", role: "Estate manager", height: 1.68 },
];
export const DEFAULT_DRIVER: DriverId = "rider";
export const driverOf = (id: string | undefined) => DRIVERS.find((d) => d.id === id) ?? DRIVERS[0];
export const driverModel = (id: DriverId) => `/models/drivers/${id}.glb`;
export const driverPortrait = (id: DriverId) => `/drivers/${id}.webp`;
