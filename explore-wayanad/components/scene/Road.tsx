"use client";
import { useMemo } from "react";
import {
  BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, CylinderGeometry, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3,
} from "three";
import { SECTION, height } from "@/lib/terrain";

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
    side.set(tan.z, 0, -tan.x).normalize().multiplyScalar(SECTION.half);
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
  const m = new MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
  const color = load("asphalt-color", true), normal = load("asphalt-normal", false);
  m.customProgramCacheKey = () => "explore-wayanad-asphalt-1";
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { tAsphalt: { value: color }, tAsphaltN: { value: normal }, uTile: { value: 1 / TILE }, uWidth: { value: SECTION.half * 2 } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aRoad;\nvarying vec2 vRoad;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRoad = aRoad;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vRoad;\nuniform sampler2D tAsphalt, tAsphaltN;\nuniform float uTile, uWidth;")
      .replace("#include <map_fragment>", `
        vec2 aUv = vec2(vRoad.x * uWidth, vRoad.y) * uTile;
        diffuseColor.rgb *= texture2D(tAsphalt, aUv).rgb;
        // markings, widths in road-fractions: edge lines 15 cm, centre dashes 10 cm, 4.5 m on / 4.5 m off
        float edge = 1.0 - smoothstep(0.018, 0.026, min(vRoad.x, 1.0 - vRoad.x) - 0.02);
        float centre = (1.0 - smoothstep(0.004, 0.008, abs(vRoad.x - 0.5))) * step(0.5, fract(vRoad.y / 0.9));
        float paint = max(edge * step(0.02, min(vRoad.x, 1.0 - vRoad.x)), centre);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.82, 0.78), paint * 0.9);`)
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = mix(0.9, 0.6, paint);")
      .replace("#include <normal_fragment_maps>", `
        vec3 an = texture2D(tAsphaltN, aUv).xyz * 2.0 - 1.0;
        normal = normalize(normal + (viewMatrix * vec4(an.x, 0.0, an.y, 0.0)).xyz * 0.5);`);
  };
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

  /* striped barrier posts on the valley-side shoulder — the churam's signature detail */
  const posts = useMemo(() => {
    const n = Math.round(curve.getLength() / POSTS.every);
    const mesh = new InstancedMesh(
      new CylinderGeometry(POSTS.radius, POSTS.radius, POSTS.height, 8),
      new MeshStandardMaterial({ map: stripes(), roughness: 0.7 }),
      n,
    );
    const m = new Matrix4(), side = new Vector3();
    for (let i = 0; i < n; i++) {
      const t = i / n, pt = curve.getPointAt(t), tan = curve.getTangentAt(t);
      side.set(tan.z, 0, -tan.x).normalize();
      // the drop is on whichever side the ground is lower, sampled past the road's edge
      const outer = height(pt.x + side.x * 2, pt.z + side.z * 2) < height(pt.x - side.x * 2, pt.z - side.z * 2) ? 1 : -1;
      const p = pt.clone().addScaledVector(side, outer * POSTS.at);
      m.makeTranslation(p.x, height(p.x, p.z) + POSTS.height / 2, p.z);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    return mesh;
  }, [curve]);

  return (
    <group name="road">
      <primitive object={surface} />
      <primitive object={posts} />
    </group>
  );
}
