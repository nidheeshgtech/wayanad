/**
 * Mountain weather for the churam: a small state machine that drifts between clear, partly cloudy, overcast, mist,
 * drizzle, moderate rain, a downpour (drive mode only) and clearing, and a set of smoothly interpolated values the scene reads every frame.
 *
 * - Nothing jumps: each value approaches its target exponentially (time constants of 20–40 s), wetness lags the rain
 *   and dries slowly afterwards.
 * - Every visit starts in clear daylight; drizzle can't begin in the first RAIN_AFTER seconds; about a third of visits
 *   stay dry. The next state is drawn at random (weights below), a little more often misty or cloudy higher up the
 *   climb, so the same hairpin doesn't always get the same weather.
 * - Time only advances while frames render: a hidden tab (no requestAnimationFrame) pauses the weather and its effects.
 * - Development only: `?weather=clear|partly|overcast|mist|drizzle|rain|downpour|clearing` pins a state at full strength (for reviewing looks).
 *
 * No three.js here; `wetUniform` is a plain { value } object shader materials share.
 */

export type WeatherName = "clear" | "partly" | "overcast" | "mist" | "drizzle" | "rain" | "downpour" | "clearing";
type Target = { cloud: number; mist: number; rain: number };

const STATES: Record<WeatherName, Target & { hold: [number, number]; next: Partial<Record<WeatherName, number>> }> = {
  // bright daylight most of the time (the owner's call): clear and partly cloudy hold longest and recur most
  clear: { cloud: 0.06, mist: 0, rain: 0, hold: [70, 150], next: { partly: 4, clear: 3, mist: 1 } },
  partly: { cloud: 0.32, mist: 0.08, rain: 0, hold: [50, 110], next: { clear: 4, overcast: 2, partly: 1, mist: 1 } },
  overcast: { cloud: 0.8, mist: 0.25, rain: 0, hold: [30, 60], next: { partly: 4, mist: 2, drizzle: 2 } },
  mist: { cloud: 0.6, mist: 0.75, rain: 0, hold: [25, 50], next: { partly: 3, clearing: 2, overcast: 1 } },
  drizzle: { cloud: 0.9, mist: 0.4, rain: 0.65, hold: [25, 45], next: { clearing: 4, rain: 1 } },
  rain: { cloud: 1, mist: 0.55, rain: 1, hold: [20, 40], next: { clearing: 1 } },
  // the monsoon at its heaviest: drive mode only (setDriveWeather leads here); sheets of rain, low cloud, near dark
  downpour: { cloud: 1, mist: 0.75, rain: 1.4, hold: [20, 35], next: { rain: 2, clearing: 1 } },
  clearing: { cloud: 0.25, mist: 0.12, rain: 0, hold: [40, 80], next: { clear: 4, partly: 1 } },
};
const TAU = { cloud: 30, mist: 25, rain: 15, wetUp: 18, wetDown: 70 }; // s: time constants
let RAIN_AFTER = 90; // s of a visit before drizzle is allowed
let DRY_VISITS = 0.35; // share of visits with no drizzle at all
/** Drive mode (/drive) wants weather you drive through: showers placed along the road by distance, shuffled every
 * drive (see planShowers), and under them the day turns properly dark (`weather.gloom`, read by the lighting).
 * The story keeps its bright default. */
let showery = false;
/** Drive mode's showers: [from, to] km along the drive and how hard. Between them only dry states drift. */
type Shower = { from: number; to: number; kind: WeatherName };
let showers: Shower[] = [], km = 0, lastKm = 0;
const RAINY: WeatherName[] = ["drizzle", "rain", "downpour"];
/** A new set of showers: the first always early (0.6–1.6 km in, so every drive gets one), then one every 1.5–5 km,
 * each 1–3 km long, drizzle, rain or a downpour; about one in five of the later ones doesn't come (dry stretches). */
function planShowers(): Shower[] {
  const out: Shower[] = [];
  for (let at = 0.6 + random(), first = true; at < 80; first = false) {
    const len = 1 + random() * 2, r = random();
    if (first || random() > 0.2) out.push({ from: at, to: at + len, kind: r < 0.3 ? "drizzle" : r < 0.72 ? "rain" : "downpour" });
    at += len + 1.5 + random() * 3.5;
  }
  return out;
}
export function setDriveWeather() {
  showery = true; RAIN_AFTER = 40; DRY_VISITS = 0;
  Object.assign(STATES.clear.next, { partly: 3, overcast: 2, clear: 1 });
  Object.assign(STATES.partly.next, { overcast: 3, drizzle: 1, clear: 2 });
  Object.assign(STATES.overcast.next, { drizzle: 3, rain: 2, partly: 1 });
  Object.assign(STATES.drizzle.next, { rain: 2, clearing: 2 });
  Object.assign(STATES.rain.next, { downpour: 2, clearing: 2 });
  STATES.clear.hold = [40, 80]; STATES.partly.hold = [30, 60];
  showers = planShowers();
}

/** Current weather. `sun` (0–1) is how much direct sunlight gets through, with slow cloud shadows passing over. */
type WeatherState = { cloud: number; mist: number; rain: number; wet: number; sun: number; gloom: number; state: WeatherName };
/** (one object for the page, like lib/game's: the scene and the HUD load in different chunks) */
export const weather: WeatherState = ((globalThis as { __wayanadWeather?: WeatherState }).__wayanadWeather ??= { cloud: 0.06, mist: 0, rain: 0, wet: 0, sun: 1, gloom: 0, state: "clear" });
export const wetUniform = { value: 0 };
/** Cloud shadows sliding over the land: `uCloudCover` is how broken the cloud is (0 clear or full, 1 half-covered),
 * `uWeatherTime` drives the drift. Used by CLOUD_SHADOW_GLSL in the ground, road and plant shaders. */
export const cloudShadowUniforms = { uCloudCover: { value: 0 }, uWeatherTime: { value: 0 } };

/** GLSL: `float cloudShadow(vec2 worldXZ)` — 1 where a cloud's shadow lies now, 0 in sun. Units of 10 m; shadows are
 * a few hundred metres across and drift with the wind. */
export const CLOUD_SHADOW_GLSL = /* glsl */ `
  uniform float uCloudCover, uWeatherTime;
  float cloudShadow(vec2 p) {
    vec2 q = p + vec2(uWeatherTime * 0.9, uWeatherTime * 0.35);
    float n = 0.5 + 0.25 * sin(q.x * 0.013) * sin(q.y * 0.011 + 1.3) + 0.25 * sin((q.x + q.y) * 0.021 + 0.7) * sin(q.x * 0.017 - q.y * 0.009);
    return smoothstep(0.52, 0.66, n) * uCloudCover;
  }
`;

let clock = 0, until = 0, forced: WeatherName | null = null, dryVisit = false, random = Math.random, started = false;

function start() {
  started = true;
  const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("weather") : null;
  if (process.env.NODE_ENV !== "production" && q && Object.hasOwn(STATES, q)) {
    forced = q as WeatherName;
    const { cloud, mist, rain } = STATES[forced];
    Object.assign(weather, { cloud, mist, rain, state: forced, wet: rain > 0 ? 1 : 0 });
  }
  dryVisit = random() < DRY_VISITS;
  until = showery ? 30 : STATES.clear.hold[0] + random() * (STATES.clear.hold[1] - STATES.clear.hold[0]);
}

function pick(progress: number) {
  const from = STATES[weather.state], high = Math.min(1, Math.max(0, progress)); // higher up the ghat: wetter
  const options = Object.entries(from.next).map(([name, w]) => {
    let weight = w ?? 0;
    if (name === "drizzle" && (dryVisit || clock < RAIN_AFTER)) weight = 0;
    if (showery && RAINY.includes(name as WeatherName)) weight = 0; // drive mode: rain only where the plan puts it
    if (name === "mist" || name === "overcast") weight *= 1 + high;
    return [name as WeatherName, weight] as const;
  }).filter(([, w]) => w > 0);
  const total = options.reduce((a, [, w]) => a + w, 0);
  let roll = random() * total;
  for (const [name, w] of options) { if ((roll -= w) <= 0) return name; }
  return options[0]?.[0] ?? "partly";
}

/** Advance the weather by dt seconds; `progress` is how far up the climb you are (0–1), `driven` the km driven so far
 * (drive mode). Call once per frame. */
export function stepWeather(dt: number, progress: number, driven = 0) {
  if (!started) start();
  dt = Math.min(dt, 0.25); // a long frame (tab switch) doesn't fast-forward the sky
  clock += dt;
  if (showery && !forced) {
    km = driven;
    if (km < lastKm - 0.5) showers = planShowers(); // a restart from Adivaram: a new set of showers
    lastKm = km;
    // cloud builds over the last 400 m before a shower, and it clears over 600 m after
    const z = showers.find((w) => km >= w.from - 0.4 && km < w.to + 0.6);
    const want: WeatherName | null = z ? (km < z.from ? "overcast" : km < z.to ? z.kind : "clearing") : RAINY.includes(weather.state) ? "clearing" : null;
    if (want && weather.state !== want) { weather.state = want; until = clock + (z ? 1e9 : 40); }
    else if (!z && until > 1e8) until = clock + 30;
  }
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
  // (the moving shadows on the land come from CLOUD_SHADOW_GLSL; here only a gentle swell in the overall sunlight)
  const cover = weather.cloud + (passing - 0.5) * 0.35 * 4 * weather.cloud * (1 - weather.cloud);
  weather.sun = 1 - smooth(0.15, 0.9, cover);
  // how dark the day gets (drive mode only): heavy cloud and rain, like a monsoon shower on the ghat
  weather.gloom = showery ? Math.min(1, weather.cloud * 0.5 + weather.rain * 0.5) : 0;
  wetUniform.value = weather.wet;
  cloudShadowUniforms.uCloudCover.value = 0.55 * Math.min(1, 4 * weather.cloud * (1 - weather.cloud) * 1.2);
  cloudShadowUniforms.uWeatherTime.value = clock;
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

/** Development controls change targets; transitions remain smooth. Null resumes organic weather. */
export function setWeatherForReview(name: WeatherName | null) {
  if (process.env.NODE_ENV === "production") return;
  if (!started) start();
  forced = name;
  if (name) weather.state = name;
  else until = clock + 30;
}
export const weatherNames = Object.keys(STATES) as WeatherName[];
