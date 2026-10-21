/**
 * Loading progress for the start screens: models and textures (three's default loading manager, which the GLTF and
 * texture loaders use; hooked up by components/scene/Warmup.tsx, so this file stays free of three.js and the title
 * screen stays out of the scene's bundle) and whether the scene has been warmed up (every shader compiled).
 * One object for the page: the DOM reads it, the scene writes it.
 */
type LoadingState = { loaded: number; total: number; ready: boolean };
export const loading: LoadingState = ((globalThis as { __wayanadLoading?: LoadingState }).__wayanadLoading ??= { loaded: 0, total: 0, ready: false });

/** 0–1 for a progress bar: loading counts for 90 %, the warm-up for the rest. */
export const progress = () => (loading.ready ? 1 : loading.total ? 0.9 * (loading.loaded / loading.total) : 0.05);
