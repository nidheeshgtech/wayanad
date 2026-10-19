/** Hermite ease of x between edge0 and edge1, clamped (same curve as three's MathUtils.smoothstep). */
export function smoothstep(x: number, edge0: number, edge1: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Storyboard fog for the climb, keyed to the hairpins (t on the road, bend 1 = bends[0]): clear air through 1–3,
 * first mist by 6, nearly white from 7 to 9, then the mist breaks before Lakkidi. Shared by the 3D and photo views. */
export function churamMood(t: number, bends: number[]) {
  const keys: [number, number, number][] = [ // [t, fog density, mist opacity]
    [0, 0.02, 0.12], [bends[2], 0.022, 0.18], [bends[5], 0.06, 0.35], [bends[6], 0.11, 0.55], [bends[8], 0.11, 0.55], [0.98, 0.012, 0],
  ];
  const i = Math.max(0, keys.findIndex(([k]) => k > t) - 1);
  const [t0, f0, m0] = keys[i], [t1, f1, m1] = keys[Math.min(i + 1, keys.length - 1)];
  const k = t1 > t0 ? smoothstep(t, t0, t1) : 1;
  return { fog: f0 + (f1 - f0) * k, mist: m0 + (m1 - m0) * k };
}
