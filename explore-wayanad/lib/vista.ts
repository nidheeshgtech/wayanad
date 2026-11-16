/**
 * The view from the Lakkidi View Point (components/drive/Vista): when you stop at its café for your chai, the camera
 * leaves the car, goes out over the railing and takes in the valley for a few seconds, then comes back. A frame of it is
 * kept (`blob`) for the "Share the view" picture (lib/shareCard shareView) and the climb's share card. Once per climb.
 */
type Vista = { t0: number; run: number; blob: Blob | null; ended: number };
export const vista: Vista = ((globalThis as { __wayanadVista?: Vista }).__wayanadVista ??= { t0: -1, run: -1, blob: null, ended: 0 });
export const VISTA = { in: 1.6, hold: 5.2, out: 1.4, shootAt: 2.4 }; // seconds
export const vistaLength = () => VISTA.in + VISTA.hold + VISTA.out;
export function startVista(run: number) {
  if (vista.run === run) return;
  vista.run = run; vista.t0 = performance.now(); vista.blob = null; vista.ended = 0;
}
/** Seconds into the sweep, or -1 when there's none. */
export function vistaTime() {
  if (vista.t0 < 0) return -1;
  const t = (performance.now() - vista.t0) / 1000;
  return t <= vistaLength() ? t : -1;
}
