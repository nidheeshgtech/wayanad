/**
 * The car and colour you're driving (data/cars.ts), shared by the start screen, the garage in the pause menu and the
 * scene (PlayerCar swaps its model when it changes). A tiny store with subscribers, read in React through useChoice;
 * set it with setChoice, which also saves it on the device and tells the room (lib/net).
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_CHOICE, saveChoice, savedChoice, type Choice } from "@/data/cars";
import { sendCar } from "@/lib/net";

type Store = { value: Choice; loaded: boolean; subs: Set<() => void> };
const store: Store = ((globalThis as { __wayanadChoice?: Store }).__wayanadChoice ??= { value: DEFAULT_CHOICE, loaded: false, subs: new Set() });

export function getChoice() {
  if (!store.loaded && typeof window !== "undefined") { store.loaded = true; store.value = savedChoice(); }
  return store.value;
}
export function setChoice(c: Choice) {
  store.value = c; store.loaded = true; saveChoice(c); sendCar(c);
  for (const f of store.subs) f();
}
const subscribe = (f: () => void) => { store.subs.add(f); return () => store.subs.delete(f); };
export const useChoice = () => useSyncExternalStore(subscribe, getChoice, () => DEFAULT_CHOICE);
