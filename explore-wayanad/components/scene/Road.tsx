"use client";
import { useMemo } from "react";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry, DoubleSide, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3,
} from "three";
import { SECTION, archT, height, roadShapeAt } from "@/lib/terrain";
import { CLOUD_SHADOW_GLSL, cloudShadowUniforms, wetUniform } from "@/lib/weather";

/* True scale, 1 unit = 10 m. Curve points sit 0.6 above the road bed (a convention from the prototype). */
const LIFT = 0.012; // asphalt sits a hand's width proud of the band, which is shaded identically beneath it
const TILE = 0.3; // one asphalt texture tile per 3 m
const POSTS = { every: 0.25, radius: 0.02, height: 0.08, at: SECTION.half + 0.18 }; // 80 cm posts every 2.5 m on the shoulder

/** The road surface: a strip following the curve with u across (0–1) and v = distance along it, for texture and markings. */
function ribbon(curve: CatmullRomCurve3, segments: number) {
  const pos = new Float32Array((segments + 1) * 6), uv = new Float32Array((segments + 1) * 4), index: number[] = [];
  const side = new Vector3();
  let along = 0, prev = curve.getPointAt(0);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    along += p.distanceTo(prev); prev = p;
    side.set(tan.z, 0, -tan.x).normalize().multiplyScalar(SECTION.half + roadShapeAt(t).widen); // wider round hairpins
    const y = p.y - 0.6 + LIFT;
    pos.set([p.x + side.x, y, p.z + side.z, p.x - side.x, y, p.z - side.z], i * 6);
    uv.set([0, along, 1, along], i * 4);
    if (i) { const a = (i - 1) * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } // counter-clockwise from above
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("aRoad", new BufferAttribute(uv, 2)); // u across, v = distance along (not `uv`: three declares that itself)
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** Poly Haven CC0 asphalt with painted lines: solid white edges, dashed white centre (Indian national highway marking). */
function asphalt() {
  const loader = new TextureLoader();
  const load = (name: string, srgb: boolean) => {
    const t = loader.load(`/textures/${name}.jpg`); t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = SRGBColorSpace; return t;
  };
  const m = new MeshStandardMaterial({ color: 0x86867f, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
  const color = load("asphalt-color", true), normal = load("asphalt-normal", false);
  m.customProgramCacheKey = () => "explore-wayanad-asphalt-3";
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { tAsphalt: { value: color }, tAsphaltN: { value: normal }, uTile: { value: 1 / TILE }, uWidth: { value: SECTION.half * 2 }, uWet: wetUniform, ...cloudShadowUniforms });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aRoad;\nvarying vec2 vRoad;\nvarying vec2 vRoadXZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRoad = aRoad;\nvRoadXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec2 vRoad;\nvarying vec2 vRoadXZ;\nuniform sampler2D tAsphalt, tAsphaltN;\nuniform float uTile, uWidth, uWet;\n${CLOUD_SHADOW_GLSL}`)
      .replace("#include <map_fragment>", `
        vec2 aUv = vec2(vRoad.x * uWidth, vRoad.y) * uTile;
        diffuseColor.rgb *= texture2D(tAsphalt, aUv).rgb;
        // a used ghat road, not a fresh render: large-scale tone drift; darker, polished wheel tracks (two per lane);
        // patch repairs in darker, smoother asphalt; crumbled edges with soil washed in from the shoulders
        float drift = texture2D(tAsphalt, vec2(vRoad.x * uWidth, vRoad.y) * 0.06 + 0.37).g;
        float u = vRoad.x;
        float track = exp(-pow((u - 0.13) / 0.045, 2.0)) + exp(-pow((u - 0.37) / 0.045, 2.0)) + exp(-pow((u - 0.63) / 0.045, 2.0)) + exp(-pow((u - 0.87) / 0.045, 2.0));
        float cell = floor(vRoad.y / 0.55), lane = step(0.5, u);
        float h1 = fract(sin(cell * 12.9898 + lane * 78.233) * 43758.5453), h2 = fract(sin(cell * 39.346 + lane * 11.135) * 24634.6345);
        float along = fract(vRoad.y / 0.55), patchMask = step(0.86, h1) * step(0.1, along) * step(along, 0.25 + 0.6 * h2)
                    * step(abs(u - (0.25 + 0.5 * lane)), 0.12 + 0.1 * h2);
        float rim = 1.0 - smoothstep(0.0, 0.07, min(u, 1.0 - u));
        float crumble = rim * smoothstep(0.35, 0.65, texture2D(tAsphalt, aUv * 2.7 + 0.5).r + 0.3 * drift);
        diffuseColor.rgb *= (0.86 + 0.28 * drift) * (1.0 - 0.1 * track) * mix(1.0, 0.72, patchMask);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.27, 0.2), crumble * 0.75 + rim * 0.12); // soil and grit at the edge
        diffuseColor.rgb *= 1.0 - 0.45 * cloudShadow(vRoadXZ);
        // markings, widths in road-fractions: edge lines 15 cm, centre dashes 10 cm, 4.5 m on / 4.5 m off
        float edge = 1.0 - smoothstep(0.018, 0.026, min(vRoad.x, 1.0 - vRoad.x) - 0.02);
        float centre = (1.0 - smoothstep(0.004, 0.008, abs(vRoad.x - 0.5))) * step(0.5, fract(vRoad.y / 0.9));
        float paint = max(edge * step(0.02, min(vRoad.x, 1.0 - vRoad.x)), centre);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.82, 0.78), paint * 0.9);`)
      .replace("#include <roughnessmap_fragment>", "diffuseColor.rgb *= mix(1.0, 0.68, uWet);\nfloat roughnessFactor = mix(mix(0.9 - 0.12 * track - 0.12 * patchMask, 0.42, uWet), 0.62, paint);") // wet (lib/weather): darker, with a sheen
      .replace("#include <normal_fragment_maps>", `
        vec3 an = texture2D(tAsphaltN, aUv).xyz * 2.0 - 1.0;
        normal = normalize(normal + (viewMatrix * vec4(an.x, 0.0, an.y, 0.0)).xyz * 0.5);`);
  };
  return m;
}

/* W-beam guardrail, true scale: 31 cm deep beam, top at 75 cm, on the road side of the posts. Its cross-section is
 * five rows of vertices whose normals tilt up and down, so the corrugations catch the light like pressed steel. */
const RAIL = { bottom: 0.044, top: 0.075, inset: 0.012, rows: [[0, -0.6], [0.25, 0.6], [0.5, -0.6], [0.75, 0.6], [1, -0.6]] as const };

/** One continuous rail along each run of posts on the same side; breaks where the valley side switches. */
function guardRail(feet: { p: Vector3; y: number; outer: number; side: Vector3 }[]) {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [], R = RAIL.rows.length;
  let run = -1;
  feet.forEach((f, i) => {
    const prev = feet[i - 1];
    if (!prev || prev.outer !== f.outer || prev.p.distanceTo(f.p) > POSTS.every * 3) run = -1;
    const base = pos.length / 3, inward = f.side.clone().multiplyScalar(-1); // the face toward the road
    for (const [h, tilt] of RAIL.rows) {
      const y = f.y + RAIL.bottom + (RAIL.top - RAIL.bottom) * h;
      pos.push(f.p.x + inward.x * RAIL.inset, y, f.p.z + inward.z * RAIL.inset);
      const n = inward.clone().setY(tilt).normalize();
      nor.push(n.x, n.y, n.z);
    }
    if (run >= 0) for (let r = 0; r < R - 1; r++) idx.push(run + r, base + r, run + r + 1, run + r + 1, base + r, base + r + 1);
    run = base;
  });
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("normal", new BufferAttribute(new Float32Array(nor), 3));
  geo.setIndex(idx);
  const m = new Mesh(geo, new MeshStandardMaterial({ color: 0xb9bdbf, metalness: 0.75, roughness: 0.38, side: DoubleSide }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Yellow and black bands, wrapped round the posts. */
function stripes() {
  const c = document.createElement("canvas"); c.width = 4; c.height = 64;
  const ctx = c.getContext("2d")!;
  for (let b = 0; b < 4; b++) { ctx.fillStyle = b % 2 ? "#1a1a1a" : "#e0b531"; ctx.fillRect(0, b * 16, 4, 16); }
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; return tex;
}

export default function Road({ curve, detail = 900 }: { curve: CatmullRomCurve3; detail?: number }) {
  const surface = useMemo(() => {
    const m = new Mesh(ribbon(curve, detail), asphalt());
    m.receiveShadow = true;
    return m;
  }, [curve, detail]);

  /* striped barrier posts on the valley-side shoulder — the churam's signature detail — carrying a galvanised W-beam rail */
  const [posts, rail] = useMemo(() => {
    const n = Math.round(curve.getLength() / POSTS.every);
    const mesh = new InstancedMesh(
      new CylinderGeometry(POSTS.radius, POSTS.radius, POSTS.height, 8),
      new MeshStandardMaterial({ map: stripes(), roughness: 0.7 }),
      n,
    );
    const m = new Matrix4(), side = new Vector3();
    const feet: { p: Vector3; y: number; outer: number; side: Vector3 }[] = [];
    let placed = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n, pt = curve.getPointAt(t), tan = curve.getTangentAt(t);
      if (t > archT()) break; // the ghat ends at the gateway; Lakkidi's shops line the road beyond
      side.set(tan.z, 0, -tan.x).normalize();
      // the drop is on whichever side the ground is lower, sampled past the road's edge
      const outer = height(pt.x + side.x * 2, pt.z + side.z * 2) < height(pt.x - side.x * 2, pt.z - side.z * 2) ? 1 : -1;
      const p = pt.clone().addScaledVector(side, outer * (POSTS.at + roadShapeAt(t).widen)), y = height(p.x, p.z);
      m.makeTranslation(p.x, y + POSTS.height / 2, p.z);
      mesh.setMatrixAt(placed++, m);
      feet.push({ p, y, outer, side: side.clone().multiplyScalar(outer) });
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    return [mesh, guardRail(feet)];
  }, [curve]);

  return (
    <group name="road">
      <primitive object={surface} />
      <primitive object={posts} />
      <primitive object={rail} />
    </group>
  );
}
