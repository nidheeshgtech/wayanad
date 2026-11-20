/**
 * The towns on the road from OpenStreetMap (scripts/bake-towns.ts → public/terrain/towns.json): real building outlines
 * and the kinds of shops and services along NH766 at Vythiri, Kalpetta and Sulthan Bathery. Loaded with the terrain
 * (components/scene/Scene); components/scene/realTowns turns them into lots. Null until loaded, or if missing.
 */
export type TownBuilding = { fp: [number, number][]; kind: string; levels?: number; use?: string };
export type TownData = { towns: { name: string; road: "churam" | "forest"; buildings: TownBuilding[]; pois: { lat: number; lon: number; use: string }[] }[] };

let data: TownData | null = null;
export const setTowns = (d: TownData | null) => { data = d; };
export const townData = () => data;
export const loadTowns = () => fetch("/terrain/towns.json").then((r) => (r.ok ? (r.json() as Promise<TownData>) : null)).catch(() => null);
