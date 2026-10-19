/** Development-only timing of an expensive build step (scene geometry, placement), logged as "[build] label: N ms". */
export function timed<T>(label: string, fn: () => T): T {
  if (process.env.NODE_ENV === "production") return fn();
  const t0 = performance.now(), out = fn();
  console.info(`[build] ${label}: ${Math.round(performance.now() - t0)} ms`);
  return out;
}
