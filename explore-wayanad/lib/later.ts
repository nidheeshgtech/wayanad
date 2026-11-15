import { loading } from "@/lib/loading";

/**
 * Work put off until the start screen is up (lib/loading `ready`, then a moment for it to appear): the forest, the
 * tea estates, the waterfalls and streams — most of the loading time on phones (fifteen to twenty-five seconds of
 * building before anything showed). Jobs run one at a time with a frame between, so the start screen stays live while
 * the world fills in behind it; `last` jobs wait for the rest (the forest near the start first).
 */
type Job = () => void | Promise<unknown>;
const first: Job[] = [], last: Job[] = [];
let busy = false, readyAt = 0;
const GRACE = 1500; // ms after ready: the loader fades and the start screen draws before anything heavy runs

export function later(job: Job, { after = false } = {}) {
  (after ? last : first).push(job);
  if (!busy) { busy = true; setTimeout(tick, 0); }
}

async function tick() {
  if (!loading.ready) { setTimeout(tick, 120); return; }
  if (!readyAt) readyAt = performance.now();
  if (performance.now() - readyAt < GRACE) { setTimeout(tick, 100); return; }
  const job = first.shift() ?? last.shift();
  if (job) { try { await job(); } catch (e) { console.error(e); } }
  if (first.length || last.length) setTimeout(tick, 16); else busy = false;
}
