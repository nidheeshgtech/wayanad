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

/**
 * A vehicle you've waved down and taken (components/drive/OnFoot): driven instead of your own until you swap back.
 * Not saved and not sent to the room (friends still see your own car). `parked`: your own, where you left it.
 */
type Borrow = { value: Choice | null; subs: Set<() => void> };
const borrow: Borrow = ((globalThis as { __wayanadBorrow?: Borrow }).__wayanadBorrow ??= { value: null, subs: new Set() });
export const getBorrow = () => borrow.value;
export function setBorrow(c: Choice | null) { borrow.value = c; for (const f of borrow.subs) f(); }
const subscribeBorrow = (f: () => void) => { borrow.subs.add(f); return () => borrow.subs.delete(f); };
export const useBorrow = () => useSyncExternalStore(subscribeBorrow, getBorrow, () => null);

