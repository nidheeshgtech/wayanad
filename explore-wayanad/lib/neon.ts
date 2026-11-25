/**
 * Drive mode at night, the neon look (the owner's brief, 25 Nov 2026): a midnight-indigo sky, electric blue, neon violet
 * and hot pink light, cyan and lime accents, soft bloom (components/drive/DriveFx) and the lights mirrored as streaks on
 * the wet asphalt. Day, the story page and the site's own palette are untouched: everything here scales with `uNeon`,
 * which is the night (and a little of dusk), drive mode only.
 *
 * The lights: anything that shines registers itself here (street lamps: Town; the gate's ground lamps: Gateway), and
 * each frame the nearest few to the camera, with your car's tail lamps, go to the road's shader (components/scene/Road)
 * as uniforms. Positions are world units.
 */
import { Color, Matrix4, Vector3, type Camera, type Object3D } from "three";
import { duskness, nightness } from "@/lib/theme";

export const NEON = {
  indigo: new Color(0x0b0826), indigoFog: new Color(0x1c1546), indigoMist: new Color(0x2b2358), moon: new Color(0x6c7ad6),
  blue: new Color(0x2f6bff), violet: new Color(0x9a4dff), pink: new Color(0xff2d95), cyan: new Color(0x2af0ff), lime: new Color(0xa8ff3e),
};
/** The street lamps' colours, in turn along the road. */
export const LAMP_COLOURS = [NEON.cyan, NEON.pink, NEON.blue, NEON.violet];

export const MAX_LIGHTS = 16;
type Light = { x: number; y: number; z: number; color: Color; power: number };
const sets = new Map<string, Light[]>();
export const neonUniforms = {
  uNeon: { value: 0 },
  uNeonCount: { value: 0 },
  uNeonPos: { value: new Float32Array(MAX_LIGHTS * 4) },  // xyz, power
  uNeonCol: { value: new Float32Array(MAX_LIGHTS * 3) },
};
export const neon = { limit: MAX_LIGHTS, on: false, under: null as Color | null }; // under: your underglow (lib/shop)

/** Register (or replace) a group of fixed lights under `key`. */
export function setLights(key: string, list: Light[]) { sets.set(key, list); }

const TAIL = [new Vector3(0.075, 0.075, -0.2), new Vector3(-0.075, 0.075, -0.2)], RED = new Color(0xff2030), tmp = new Vector3(), m4 = new Matrix4();
const pick: { d: number; l: Light }[] = [], UNDER = new Vector3(0, 0.02, 0);

/** How neon the night is now: 0 by day, 1 at night (dusk a little). */
export const neonAmount = () => Math.max(nightness(), 0.35 * duskness());

/** Each frame in drive mode, before the render (DriveFx): the nearest lights to the camera into the road's uniforms. */
export function stepNeon(camera: Camera, car: Object3D | null) {
  const k = neon.on ? neonAmount() : 0;
  neonUniforms.uNeon.value = k;
  if (k <= 0.001) { neonUniforms.uNeonCount.value = 0; return; }
  const cx = camera.position.x, cz = camera.position.z, slots = Math.min(neon.limit, MAX_LIGHTS) - (car ? (neon.under ? 3 : 2) : 0);
  pick.length = 0;
  for (const list of sets.values()) for (const l of list) {
    const d = (l.x - cx) ** 2 + (l.z - cz) ** 2;
    if (d > 400) continue; // 200 m
    if (pick.length < slots) { pick.push({ d, l }); pick.sort((a, b) => a.d - b.d); }
    else if (d < pick[pick.length - 1].d) { pick[pick.length - 1] = { d, l }; pick.sort((a, b) => a.d - b.d); }
  }
  const P = neonUniforms.uNeonPos.value, C = neonUniforms.uNeonCol.value;
  let n = 0;
  const put = (x: number, y: number, z: number, c: Color, power: number) => { P.set([x, y, z, power], n * 4); C.set([c.r, c.g, c.b], n * 3); n++; };
  for (const { l } of pick) put(l.x, l.y, l.z, l.color, l.power);
  if (car) { car.updateMatrixWorld(); m4.copy(car.matrixWorld); for (const t of TAIL) { tmp.copy(t).applyMatrix4(m4); put(tmp.x, tmp.y, tmp.z, RED, 0.1); }
    if (neon.under) { tmp.copy(UNDER).applyMatrix4(m4); put(tmp.x, tmp.y, tmp.z, neon.under, 0.7); } }
  neonUniforms.uNeonCount.value = n;
}

/** The road's shader: the lights mirrored in the wet asphalt as long streaks (anisotropic, stretched toward you), and
 * the markings faintly lit, edge lines cyan and the centre dashes lime. Needs vNeonW (world position), `edge`, `centre`. */
export const NEON_ROAD_GLSL = /* glsl */ `
  uniform float uNeon; uniform int uNeonCount; uniform vec4 uNeonPos[${MAX_LIGHTS}]; uniform vec3 uNeonCol[${MAX_LIGHTS}];
`;
export const NEON_ROAD_APPLY = /* glsl */ `
  if (uNeon > 0.001) {
    vec3 d = normalize(vNeonW - cameraPosition);
    vec2 dh = normalize(d.xz);
    float wetK = uNeon * (0.45 + 0.75 * uWet);
    vec3 refl = vec3(0.0);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uNeonCount) break;
      vec4 L = uNeonPos[i];
      vec3 m = vec3(L.x, 2.0 * vNeonW.y - L.y, L.z) - cameraPosition; // the light mirrored under this bit of road
      float md = length(m); m /= md;
      float az = 1.0 - dot(dh, normalize(m.xz));                       // across: tight
      float el = d.y - m.y;                                             // along the view: long
      float wide = mix(9000.0, 2500.0, uWet);
      float s = exp(-az * wide * md * 0.2) * exp(-el * el * mix(260.0, 90.0, uWet));
      vec2 off = vNeonW.xz - L.xz;
      refl += uNeonCol[i] * L.w * s * (0.35 + 1.0 / (1.0 + 0.6 * dot(off, off)));
    }
    totalEmissiveRadiance += refl * wetK * 1.6;
    totalEmissiveRadiance += uNeon * (vec3(0.1, 0.85, 1.0) * edge * step(0.02, min(vRoad.x, 1.0 - vRoad.x)) * 0.2 + vec3(0.55, 1.0, 0.2) * centre * 0.16);
  }
`;
