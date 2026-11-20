/**
 * The animal sticker book's state: which animals you've collected (kept on this device), the one just found (the
 * sticker slapping onto the screen: components/drive/Stickers), and a hint when an animal you haven't got is in view
 * ("honk!"). components/scene/Animals decides what's seen; this only keeps it. Subscribe for the UI.
 */
import type { AnimalId } from "@/data/animals";
import { ANIMALS, animal } from "@/data/animals";
import { chime } from "@/lib/horn";
import { haptic } from "@/lib/native";
import { bonus } from "@/lib/score";
import { mark } from "@/lib/stats";

const KEY = "wayanad-stickers";
type State = { have: AnimalId[]; fresh: AnimalId | null; freshAt: number; hint: AnimalId | null; loaded: boolean; v: number };
export const stickers: State = ((globalThis as { __wayanadStickers?: State }).__wayanadStickers ??= { have: [], fresh: null, freshAt: 0, hint: null, loaded: false, v: 0 });
const subs = new Set<() => void>();
const bump = () => { stickers.v++; subs.forEach((f) => f()); };
export const subscribeStickers = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

function load() {
  if (stickers.loaded) return;
  stickers.loaded = true;
  try { stickers.have = (JSON.parse(localStorage.getItem(KEY) ?? "[]") as AnimalId[]).filter((id) => ANIMALS.some((a) => a.id === id)); } catch {}
}
export function collected() { load(); return stickers.have; }

/** Honked at it in view: a new sticker (the slap, a chime, points), or, already in the book, a few points. */
export function spotted(id: AnimalId) {
  load();
  if (stickers.have.includes(id)) { bonus(10, `${animal(id).name} 👀`); return; }
  stickers.have = [...stickers.have, id];
  try { localStorage.setItem(KEY, JSON.stringify(stickers.have)); } catch {}
  stickers.fresh = id; stickers.freshAt = performance.now();
  bonus(50, `New sticker: ${animal(id).name}`); chime(true); haptic("success");
  mark(`sticker-${id}`); if (stickers.have.length === ANIMALS.filter((a) => !a.soon).length) mark("stickers-all");
  bump();
}
/** The nearest animal in view that isn't in the book yet (or null): the "honk!" hint. */
export function setHint(id: AnimalId | null) { if (stickers.hint !== id) { stickers.hint = id; bump(); } }
export function clearFresh() { if (stickers.fresh) { stickers.fresh = null; bump(); } }
