import { loading } from "@/lib/loading";
import { game } from "@/lib/game";

/**
 * Work put off until the start screen is up (lib/loading `ready`, then a moment for it to appear): the forest, the
 * tea estates, the waterfalls and streams — most of the loading time on phones (fifteen to twenty-five seconds of
 * building before anything showed). Jobs run one at a time with a frame between, so the start screen stays live while
 * the world fills in behind it; `last` jobs wait for the rest (the forest near the start first).
 */
type Job = () => void | Promise<unknown>;
const first: Job[] = [], last: Job[] = [];
let busy = false, readyAt = 0;
const firstJobs = { total: 0, done: 0 };
/** How much of the `first` work (the forest by the road) is done, 0..1: the drive's Start waits for it, so the first
 * minute of driving isn't spent building trees (on a phone that was seconds of stutter right after Start). */
export const firstProgress = () => (firstJobs.total ? firstJobs.done / firstJobs.total : 1);
const GRACE = 1500; // ms after ready: the loader fades and the start screen draws before anything heavy runs

export function later(job: Job, { after = false } = {}) {
  (after ? last : first).push(job);
  if (!after) firstJobs.total++;
  if (!busy) { busy = true; setTimeout(tick, 0); }
}

async function tick() {
  if (!loading.ready) { setTimeout(tick, 120); return; }
  if (!readyAt) readyAt = performance.now();
  if (performance.now() - readyAt < GRACE) { setTimeout(tick, 100); return; }
  const isFirst = first.length > 0, job = first.shift() ?? last.shift();
  if (job) { try { await job(); } catch (e) { console.error(e); } }
  if (job && isFirst) firstJobs.done++;
  if (first.length || last.length) setTimeout(tick, !first.length && game.started && !game.paused ? 100 : 16); else busy = false; // (while driving: frames in between)
}

/** Long builds in slices, so a phone keeps drawing frames while the world fills in (one 600 ms build was a 600 ms
 * freeze in the first seconds of the drive): `const sl = slicer(); for (...) { ...; if (sl.due()) await sl.pause(); }`
 * hands the main thread back (a frame can draw) once ~`budget` ms have passed since the last pause. */
export function slicer(budget = 10) {
  let since = performance.now();
  return {
    // (on the start screen, or paused, nobody's driving: bigger slices, the world fills in faster)
    due: () => performance.now() - since > (game.started && !game.paused ? budget : 80),
    pause: () => new Promise<void>((r) => setTimeout(() => { since = performance.now(); r(); }, 0)),
  };
}
