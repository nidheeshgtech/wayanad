import { DefaultLoadingManager } from "three";

/**
 * Loading progress for the start screens: models and textures (three's default loading manager, which the GLTF and
 * texture loaders use) and whether the scene has been warmed up (every shader compiled — components/scene/Warmup.tsx).
 * One object for the page: the DOM reads it, the scene writes it.
 */
type LoadingState = { loaded: number; total: number; ready: boolean };
export const loading: LoadingState = ((globalThis as { __wayanadLoading?: LoadingState }).__wayanadLoading ??= { loaded: 0, total: 0, ready: false });

if (typeof window !== "undefined" && !(globalThis as { __wayanadLoadingHooked?: boolean }).__wayanadLoadingHooked) {
  (globalThis as { __wayanadLoadingHooked?: boolean }).__wayanadLoadingHooked = true;
  const prev = DefaultLoadingManager.onProgress;
  DefaultLoadingManager.onProgress = (url, loaded, total) => { loading.loaded = loaded; loading.total = total; prev?.(url, loaded, total); };
}

/** 0–1 for a progress bar: loading counts for 90 %, the warm-up for the rest. */
export const progress = () => (loading.ready ? 1 : loading.total ? 0.9 * (loading.loaded / loading.total) : 0.05);
