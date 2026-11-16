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

/**
 * The people of the road (not drivers you pick): everyday Wayanad folk, our own, made the same way (Higgsfield image →
 * rigged 3D). With the drivers they walk the shoulders (components/scene/Pedestrians) and ride in the traffic.
 */
export type ExtraId = "saree" | "school" | "granny" | "picker" | "lungi" | "student" | "churidar" | "conductor";
/**
 * The visitors at the roadside stops (components/scene/StopCrowds): tourists, families, riders, a chai kada's owner —
 * made the same way, from photographs of ordinary people (Higgsfield image → rigged 3D). Only at the stops.
 */
export type TouristId = "tourist" | "kurti" | "backpacker" | "biker" | "poncho" | "dad" | "mum" | "boy" | "collegeboy" | "collegegirl" | "uncle" | "chaiman";
export const TOURISTS: { id: TouristId; role: string; height: number; woman: boolean }[] = [
  { id: "tourist", role: "Tourist in a checked shirt", height: 1.75, woman: false },
  { id: "kurti", role: "Tourist in a kurti", height: 1.6, woman: true },
  { id: "backpacker", role: "Backpacker", height: 1.62, woman: true },
  { id: "biker", role: "Touring rider", height: 1.78, woman: false },
  { id: "poncho", role: "Tourist in a rain poncho", height: 1.72, woman: false },
  { id: "dad", role: "Father on holiday", height: 1.74, woman: false },
  { id: "mum", role: "Mother on holiday", height: 1.58, woman: true },
  { id: "boy", role: "Boy on a family trip", height: 1.28, woman: false },
  { id: "collegeboy", role: "College student on a trip", height: 1.76, woman: false },
  { id: "collegegirl", role: "College student on a trip", height: 1.6, woman: true },
  { id: "uncle", role: "Retired uncle in a mundu", height: 1.68, woman: false },
  { id: "chaiman", role: "Chai kada owner", height: 1.7, woman: false },
];
export type PersonId = DriverId | ExtraId | TouristId;
export const EXTRAS: { id: ExtraId; role: string; height: number; woman: boolean }[] = [
  { id: "saree", role: "Shopper in a saree", height: 1.58, woman: true },
  { id: "school", role: "Schoolgirl", height: 1.5, woman: true },
  { id: "granny", role: "Grandmother", height: 1.5, woman: true },
  { id: "picker", role: "Tea picker", height: 1.55, woman: true },
  { id: "lungi", role: "Man in a lungi", height: 1.7, woman: false },
  { id: "student", role: "College student", height: 1.76, woman: false },
  { id: "churidar", role: "Woman in a churidar", height: 1.6, woman: true },
  { id: "conductor", role: "Bus conductor", height: 1.72, woman: false },
];
const DRIVER_WOMEN = new Set<PersonId>(["racer", "trekker"]);
const OTHERS = [...EXTRAS, ...TOURISTS];
export const personHeight = (id: PersonId) => OTHERS.find((e) => e.id === id)?.height ?? driverOf(id).height;
export const isWomanPerson = (id: PersonId) => DRIVER_WOMEN.has(id) || !!OTHERS.find((e) => e.id === id)?.woman;
export const personModel = (id: PersonId) => `/models/drivers/${id}.glb`;

