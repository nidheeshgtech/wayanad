/**
 * The ₹ shop (Kada): extras bought with the rupees earned on Churam Jobs and police getaways (lib/jobs). The owner's
 * call (25 Nov 2026): every car and colour stays free, the shop only sells new extras. What you own and what's on are
 * kept on the device. Underglow is drawn by components/drive/Underglow (and mirrored in the wet road: lib/neon).
 */
import { useSyncExternalStore } from "react";
import { Color } from "three";
import { NEON } from "@/lib/neon";
import { spend } from "@/lib/jobs";
import { setHornKind, type HornKind } from "@/lib/horn";

export type ShopItem = { id: string; name: string; kind: "glow" | "horn"; price: number; hex: string; color?: Color; horn?: HornKind; blurb: string };
export const SHOP: ShopItem[] = [
  { id: "glow-cyan", name: "Underglow · Cyan", kind: "glow", price: 300, hex: "#2af0ff", color: NEON.cyan, blurb: "Neon under the car. Best on a wet night." },
  { id: "glow-pink", name: "Underglow · Hot pink", kind: "glow", price: 300, hex: "#ff2d95", color: NEON.pink, blurb: "Kalpetta town will notice." },
  { id: "glow-lime", name: "Underglow · Lime", kind: "glow", price: 300, hex: "#a8ff3e", color: NEON.lime, blurb: "Greener than the tea estates." },
  { id: "glow-violet", name: "Underglow · Violet", kind: "glow", price: 300, hex: "#9a4dff", color: NEON.violet, blurb: "Midnight on the churam." },
  { id: "horn-chenda", name: "Horn · Chenda melam", kind: "horn", price: 250, hex: "#d9a441", horn: "chenda", blurb: "The temple drum. Clear the road, ulsavam style." },
  { id: "horn-synth", name: "Horn · Synthwave", kind: "horn", price: 200, hex: "#9a4dff", horn: "synth", blurb: "A neon chord for the night drive." },
];

const KEY = "wayanad-shop";
type State = { owned: string[]; glow: string | null; v: number };
const state: State = ((globalThis as { __wayanadShop?: State }).__wayanadShop ??= (() => {
  const s: State = { owned: [], glow: null, v: 0 };
  if (typeof window !== "undefined") try { const j = JSON.parse(localStorage.getItem(KEY) ?? "{}"); s.owned = Array.isArray(j.owned) ? j.owned : []; s.glow = typeof j.glow === "string" ? j.glow : null; } catch {}
  return s;
})());
const subs = new Set<() => void>();
const changed = () => { state.v++; try { localStorage.setItem(KEY, JSON.stringify({ owned: state.owned, glow: state.glow })); } catch {} subs.forEach((f) => f()); };

export const shop = state;
export const owns = (id: string) => state.owned.includes(id);
/** The underglow that's on, if any. */
export const glowColor = (): Color | null => (state.glow ? SHOP.find((i) => i.id === state.glow)?.color ?? null : null);

/** Buy: takes the rupees, and puts it on. False if you can't afford it. */
export function buy(id: string) {
  const item = SHOP.find((i) => i.id === id);
  if (!item || owns(id) || !spend(item.price)) return false;
  state.owned.push(id); use(id);
  return true;
}
/** Put on (underglow: off again if it's on; horn: becomes your horn). */
export function use(id: string) {
  const item = SHOP.find((i) => i.id === id);
  if (!item || !owns(id)) return;
  if (item.kind === "glow") state.glow = state.glow === id ? null : id;
  else if (item.horn) setHornKind(item.horn);
  changed();
}
export const useShop = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state.v, () => 0);
