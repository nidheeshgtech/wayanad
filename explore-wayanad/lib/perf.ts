/** Development-only timing of an expensive build step (scene geometry, placement), logged as "[build] label: N ms". */
export function timed<T>(label: string, fn: () => T): T {
  if (process.env.NODE_ENV === "production") return fn();
  const t0 = performance.now(), out = fn();
  console.info(`[build] ${label}: ${Math.round(performance.now() - t0)} ms`);
  return out;
}

/* ---- frame probe: add ?perf to the address (any build) ---- */
/** Per-system CPU time inside the render loop, frame times and renderer counts, on window.__wayanadPerf. Off unless
 * the address has ?perf, and then only a performance.now() pair per timed system per frame. */
export const probing = typeof location !== "undefined" && /[?&]perf\b/.test(location.search);
export const perfStats = { quality: -1, systems: {} as Record<string, { ms: number; n: number }> };
export function frameTimed(name: string, fn: () => void) {
  if (!probing) return fn();
  const t0 = performance.now(); fn();
  const s = (perfStats.systems[name] ??= { ms: 0, n: 0 }); s.ms += performance.now() - t0; s.n++;
}
