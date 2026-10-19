/**
 * Mountain weather for the churam: a small state machine that drifts between clear, partly cloudy, overcast, mist,
 * drizzle and clearing, and a set of smoothly interpolated values the scene reads every frame.
 *
 * - Nothing jumps: each value approaches its target exponentially (time constants of 20–40 s), wetness lags the rain
 *   and dries slowly afterwards.
 * - Every visit starts in clear daylight; drizzle can't begin in the first RAIN_AFTER seconds; about a third of visits
 *   stay dry. The next state is drawn at random (weights below), a little more often misty or cloudy higher up the
 *   climb, so the same hairpin doesn't always get the same weather.
 * - Time only advances while frames render: a hidden tab (no requestAnimationFrame) pauses the weather and its effects.
 * - `?weather=clear|partly|overcast|mist|drizzle|clearing` pins a state at full strength (for reviewing looks).
 *
 * No three.js here; `wetUniform` is a plain { value } object shader materials share.
 */

export type WeatherName = "clear" | "partly" | "overcast" | "mist" | "drizzle" | "clearing";
type Target = { cloud: number; mist: number; rain: number };

const STATES: Record<WeatherName, Target & { hold: [number, number]; next: Partial<Record<WeatherName, number>> }> = {
  clear: { cloud: 0.08, mist: 0, rain: 0, hold: [50, 110], next: { partly: 5, clear: 2, mist: 1 } },
  partly: { cloud: 0.42, mist: 0.1, rain: 0, hold: [40, 90], next: { clear: 3, overcast: 3, partly: 1, mist: 2 } },
  overcast: { cloud: 0.82, mist: 0.25, rain: 0, hold: [35, 70], next: { partly: 3, mist: 2, drizzle: 2 } },
  mist: { cloud: 0.62, mist: 0.75, rain: 0, hold: [30, 60], next: { partly: 2, overcast: 2, clearing: 2 } },
  drizzle: { cloud: 0.92, mist: 0.4, rain: 0.65, hold: [25, 50], next: { clearing: 1 } },
  clearing: { cloud: 0.3, mist: 0.15, rain: 0, hold: [40, 80], next: { clear: 3, partly: 2 } },
};
const TAU = { cloud: 30, mist: 25, rain: 15, wetUp: 18, wetDown: 70 }; // s: time constants
const RAIN_AFTER = 90; // s of a visit before drizzle is allowed
const DRY_VISITS = 0.35; // share of visits with no drizzle at all

/** Current weather. `sun` (0–1) is how much direct sunlight gets through, with slow cloud shadows passing over. */
export const weather = { cloud: 0.08, mist: 0, rain: 0, wet: 0, sun: 1, state: "clear" as WeatherName };
export const wetUniform = { value: 0 };

let clock = 0, until = 0, forced: WeatherName | null = null, dryVisit = false, random = Math.random, started = false;

function start() {
  started = true;
  const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("weather") : null;
  if (q && q in STATES) {
    forced = q as WeatherName;
    Object.assign(weather, STATES[forced], { state: forced, wet: STATES[forced].rain > 0 ? 1 : 0 });
  }
  dryVisit = random() < DRY_VISITS;
  until = STATES.clear.hold[0] + random() * (STATES.clear.hold[1] - STATES.clear.hold[0]);
}

function pick(progress: number) {
  const from = STATES[weather.state], high = Math.min(1, Math.max(0, progress)); // higher up the ghat: wetter
  const options = Object.entries(from.next).map(([name, w]) => {
    let weight = w ?? 0;
    if (name === "drizzle" && (dryVisit || clock < RAIN_AFTER)) weight = 0;
    if (name === "mist" || name === "overcast") weight *= 1 + high;
    return [name as WeatherName, weight] as const;
  }).filter(([, w]) => w > 0);
  const total = options.reduce((a, [, w]) => a + w, 0);
  let roll = random() * total;
  for (const [name, w] of options) { if ((roll -= w) <= 0) return name; }
  return options[0]?.[0] ?? "partly";
}

/** Advance the weather by dt seconds; `progress` is how far up the climb you are (0–1). Call once per frame. */
export function stepWeather(dt: number, progress: number) {
  if (!started) start();
  dt = Math.min(dt, 0.25); // a long frame (tab switch) doesn't fast-forward the sky
  clock += dt;
  if (!forced && clock > until) {
    weather.state = pick(progress);
    const h = STATES[weather.state].hold;
    until = clock + h[0] + random() * (h[1] - h[0]);
  }
  const target = STATES[weather.state], ease = (tau: number) => 1 - Math.exp(-dt / tau);
  weather.cloud += (target.cloud - weather.cloud) * ease(TAU.cloud);
  weather.mist += (target.mist - weather.mist) * ease(TAU.mist);
  weather.rain += (target.rain - weather.rain) * ease(TAU.rain);
  weather.wet += (Math.min(1, weather.rain * 1.6) - weather.wet) * ease(weather.rain * 1.6 > weather.wet ? TAU.wetUp : TAU.wetDown);
  // cloud shadows: in broken cloud the sun comes and goes over ~half a minute; under full cover it stays mostly hidden
  const passing = 0.5 + 0.5 * Math.sin(clock * 0.11) * Math.sin(clock * 0.047 + 1.3);
  const cover = weather.cloud + (passing - 0.5) * 0.7 * 4 * weather.cloud * (1 - weather.cloud);
  weather.sun = 1 - smooth(0.15, 0.9, cover);
  wetUniform.value = weather.wet;
}

/** Mist along the road comes in banks: 0–1 for this stretch (t on the road) now, drifting slowly over time. */
export function mistPatch(t: number) {
  const a = Math.sin(t * 37 + clock * 0.021), b = Math.sin(t * 91 - clock * 0.013 + 2.1);
  return smooth(-0.2, 0.8, 0.6 * a + 0.4 * b);
}

function smooth(a: number, b: number, x: number) {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}
