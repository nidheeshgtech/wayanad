"use client";
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, CatmullRomCurve3, Color, Float32BufferAttribute, Group, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { STREET, roadOf, streets } from "@/lib/streets";
import { height } from "@/lib/terrain";
import { LAMP_COLOURS, setLights } from "@/lib/neon";
import { duskness, nightness } from "@/lib/theme";
import { weather } from "@/lib/weather";

/* The side streets (lib/streets) on the ground: the asphalt (no centre line: one way), white edge lines, a raised
 * footpath of paving slabs either side with a kerb, and a skirt down from them to the ground; neon street lamps along
 * it, the ONE WAY sign at its mouth and the street's name, GIVE WAY where it comes back onto the highway. Units of
 * 10 m; the street's surface is its curve's y − 0.588, as the main road's. */
function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const noise = (g: CanvasRenderingContext2D, w: number, h: number, n: number, a: number, seed: number) => {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) { const v = Math.floor(r() * 255); g.fillStyle = `rgba(${v},${v},${v},${a})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
};

/** A strip along the street from `a` to `b` across (units, + left), at `lift` over its surface, uv v along. */
function strip(curve: CatmullRomCurve3, a: number, b: number, lift: number, uvAlong: number, step = 0.25) {
  const L = curve.getLength(), n = Math.ceil(L / step), pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const p = new Vector3(), t = new Vector3();
  for (let i = 0; i <= n; i++) {
    const u = Math.min(1, (i * step) / L); curve.getPointAt(u, p); curve.getTangentAt(u, t); t.setY(0).normalize();
    const lx = t.z, lz = -t.x, y = p.y - 0.588 + lift;
    pos.push(p.x + lx * a, y, p.z + lz * a, p.x + lx * b, y, p.z + lz * b);
    uv.push(0, (i * step) / uvAlong, 1, (i * step) / uvAlong);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  // facing up whichever way the strip was wound
  if ((g.attributes.normal.getY(0) ?? 1) < 0) { idx.reverse(); g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
/** A patch of the street's surface from s0 to s1 along and `a` to `b` across, `lift` over it (it follows the street's rise
 * and fall, so a lamp's pool doesn't dip under the asphalt on a slope), uv 0–1 each way. */
function patch(curve: CatmullRomCurve3, s0: number, s1: number, a: number, b: number, lift: number, steps = 6) {
  const L = curve.getLength(), pos: number[] = [], uv: number[] = [], idx: number[] = [], p = new Vector3(), t = new Vector3();
  for (let i = 0; i <= steps; i++) {
    const u = Math.min(1, Math.max(0, (s0 + ((s1 - s0) * i) / steps) / L)); curve.getPointAt(u, p); curve.getTangentAt(u, t); t.setY(0).normalize();
    const lx = t.z, lz = -t.x, y = p.y - 0.588 + lift;
    pos.push(p.x + lx * a, y, p.z + lz * a, p.x + lx * b, y, p.z + lz * b); uv.push(0, i / steps, 1, i / steps);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
/** A vertical face along the street at `a` across, from `top` (over the surface) down `drop`. */
function wall(curve: CatmullRomCurve3, a: number, top: number, drop: number, step = 0.25) {
  const L = curve.getLength(), n = Math.ceil(L / step), pos: number[] = [], idx: number[] = [], p = new Vector3(), t = new Vector3();
  for (let i = 0; i <= n; i++) {
    const u = Math.min(1, (i * step) / L); curve.getPointAt(u, p); curve.getTangentAt(u, t); t.setY(0).normalize();
    const x = p.x + t.z * a, z = p.z - t.x * a, y = p.y - 0.588 + top, low = Math.min(y - drop, height(x, z) - 0.1);
    pos.push(x, y, z, x, low, z);
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3); }
  }
  const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new Float32BufferAttribute(new Array((n + 1) * 4).fill(0), 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export default function Streets({ curve }: { curve: CatmullRomCurve3 }) {
  const built = useMemo(() => {
    const root = new Group(); root.name = "streets";
    const lights: { x: number; y: number; z: number; color: Color; power: number }[] = [];
    const list = streets(curve);
    if (!list.length) return { root, lights, asphalt: null as MeshStandardMaterial | null, head: null as MeshStandardMaterial | null, pool: null as MeshBasicMaterial | null };
    const asphalt = new MeshStandardMaterial({
      map: tex(256, 256, (g) => { g.fillStyle = "#3a3a3c"; g.fillRect(0, 0, 256, 256); noise(g, 256, 256, 5000, 0.18, 7);
        g.fillStyle = "#e9e9e2"; g.fillRect(4, 0, 6, 256); g.fillRect(246, 0, 6, 256); // the edge lines
        g.fillStyle = "rgba(20,20,20,.35)"; for (let i = 0; i < 6; i++) g.fillRect(30 + i * 37, 0, 8, 256); }, [1, 1]),
      roughness: 0.85, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    const paving = new MeshStandardMaterial({
      map: tex(128, 128, (g) => { g.fillStyle = "#8d8780"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#b9b2a6";
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) g.fillRect(c * 32 + 2 + (r % 2) * 8, r * 32 + 2, 28, 28);
        noise(g, 128, 128, 800, 0.15, 3); }, [1, 1]),
      roughness: 0.9,
    });
    const kerb = new MeshStandardMaterial({ color: 0xc9c6bd, roughness: 0.9 });
    const kerbPaint = new MeshStandardMaterial({ map: tex(64, 16, (g) => { g.fillStyle = "#f2f2ee"; g.fillRect(0, 0, 64, 16); g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, 32, 16); }, [1, 1]), roughness: 0.8 });
    kerbPaint.map!.wrapS = RepeatWrapping;
    const parts: BufferGeometry[] = [], walks: BufferGeometry[] = [], kerbs: BufferGeometry[] = [], skirts: BufferGeometry[] = [];
    const H = STREET.half, P = STREET.path, K = 0.016;
    for (const st of list) {
      parts.push(strip(st.curve, -H - 0.02, H + 0.02, 0, 0.64));
      for (const s of [1, -1]) {
        walks.push(strip(st.curve, s > 0 ? H + 0.02 : -P, s > 0 ? P : -H - 0.02, K, 0.32));
        kerbs.push(wall(st.curve, s * (H + 0.02), K, K + 0.005));
        skirts.push(wall(st.curve, s * P, K, 0.4));
      }
    }
    // (the street's first and last few metres lie over the highway's own asphalt: the street draws under it)
    const road = new Mesh(mergeGeometries(parts), asphalt); road.receiveShadow = true; road.renderOrder = -1; root.add(road);
    const walk = new Mesh(mergeGeometries(walks), paving); walk.receiveShadow = true; root.add(walk);
    root.add(new Mesh(mergeGeometries(kerbs), kerbPaint));
    root.add(new Mesh(mergeGeometries(skirts), kerb));
    // street lamps on alternate sides, each its own neon colour after dark, with the pool they throw
    const head = new MeshStandardMaterial({ color: 0x3a342c, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.6, vertexColors: true });
    head.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;"); };
    head.customProgramCacheKey = () => "street-lamp-neon";
    const poolTex = tex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.45, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    const pool = new MeshBasicMaterial({ map: poolTex, vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const poles: BufferGeometry[] = [], heads: BufferGeometry[] = [], pools: BufferGeometry[] = [];
    const tint = (g: BufferGeometry, c: Color) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute("color", new Float32BufferAttribute(a, 3)); return g; };
    let n = 0;
    for (const st of list) for (let s = 5; s < st.length - 4.5; s += 2.4) { // (none at the mouths: their glow in the highway's wet asphalt would end in a hard edge at the street)
      const side = n % 2 ? 1 : -1, c = LAMP_COLOURS[(n + 1) % LAMP_COLOURS.length]; n++;
      const p = st.curve.getPointAt(s / st.length), t = st.curve.getTangentAt(s / st.length).setY(0).normalize(), lx = t.z, lz = -t.x, y = p.y - 0.588 + K, yaw = Math.atan2(t.x, t.z);
      const at = new Vector3(p.x + lx * side * (P - 0.05), y, p.z + lz * side * (P - 0.05));
      poles.push(new BoxGeometry(0.018, 0.7, 0.018).translate(at.x, y + 0.35, at.z));
      const arm = new Vector3(p.x + lx * side * (P - 0.2), y, p.z + lz * side * (P - 0.2));
      poles.push(new BoxGeometry(0.15, 0.008, 0.008).rotateY(yaw + Math.PI / 2).translate((at.x + arm.x) / 2, y + 0.68, (at.z + arm.z) / 2));
      heads.push(tint(new BoxGeometry(0.06, 0.012, 0.028).rotateY(yaw + Math.PI / 2).translate(arm.x, y + 0.672, arm.z), c));
      pools.push(tint(patch(st.curve, s - 0.55, s + 0.55, side * 0.1 - 0.45, side * 0.1 + 0.45, 0.006), c));
      lights.push({ x: arm.x, y: y + 0.672, z: arm.z, color: c, power: 1 });
    }
    root.add(new Mesh(mergeGeometries(poles), new MeshStandardMaterial({ color: 0x8e8c86, roughness: 0.7 })));
    root.add(new Mesh(mergeGeometries(heads), head));
    const light = new Mesh(mergeGeometries(pools), pool); light.renderOrder = 2; root.add(light);
    // the signs: ONE WAY and the street's name at its mouth, GIVE WAY at its end
    const signMat = (draw: (g: CanvasRenderingContext2D) => void, w = 256, h = 128) => { const t = tex(w, h, draw); return new MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.05, roughness: 0.5 }); };
    const oneWay = signMat((g) => { g.fillStyle = "#1c3f9c"; g.fillRect(0, 0, 256, 128); g.fillStyle = "#fff"; g.beginPath(); g.moveTo(30, 52); g.lineTo(180, 52); g.lineTo(180, 30); g.lineTo(230, 64); g.lineTo(180, 98); g.lineTo(180, 76); g.lineTo(30, 76); g.fill(); g.fillStyle = "#1c3f9c"; g.font = "800 22px Arial,sans-serif"; g.textAlign = "center"; g.fillText("ONE WAY", 105, 72); });
    const name = (st: (typeof list)[number]) => signMat((g) => { g.fillStyle = "#14532d"; g.fillRect(0, 0, 512, 128); g.strokeStyle = "#fff"; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116); g.fillStyle = "#fff"; g.textAlign = "center"; g.font = "700 38px 'Noto Sans Malayalam','Malayalam Sangam MN',sans-serif"; g.fillText(st.ml, 256, 54, 480); g.font = "800 34px Arial,sans-serif"; g.fillText(st.name.toUpperCase(), 256, 104, 480); }, 512, 128);
    const giveWay = signMat((g) => { g.clearRect(0, 0, 128, 128); g.fillStyle = "#fff"; g.beginPath(); g.moveTo(8, 12); g.lineTo(120, 12); g.lineTo(64, 116); g.fill(); g.strokeStyle = "#d22a2a"; g.lineWidth = 12; g.beginPath(); g.moveTo(14, 16); g.lineTo(114, 16); g.lineTo(64, 108); g.closePath(); g.stroke(); }, 128, 128);
    giveWay.transparent = true;
    const post = new MeshStandardMaterial({ color: 0x777777, roughness: 0.6 });
    const plant = (st: (typeof list)[number], s: number, side: number, mat: MeshStandardMaterial, w: number, h: number, faceBack = false) => {
      const p = st.curve.getPointAt(Math.min(1, s / st.length)), t = st.curve.getTangentAt(Math.min(1, s / st.length)).setY(0).normalize(), y = p.y - 0.588 + K;
      const at = new Vector3(p.x + t.z * side * (P - 0.04), y, p.z - t.x * side * (P - 0.04));
      const pole = new Mesh(new BoxGeometry(0.012, 0.3, 0.012), post); pole.position.set(at.x, y + 0.15, at.z); root.add(pole);
      const sg = new Mesh(new PlaneGeometry(w, h), mat); sg.position.set(at.x, y + 0.3 + h / 2, at.z); sg.rotation.y = Math.atan2(t.x, t.z) + (faceBack ? 0 : Math.PI); root.add(sg);
      return sg;
    };
    for (const st of list) {
      plant(st, 2.5, st.side, oneWay, 0.18, 0.09);
      plant(st, 4.2, -st.side, name(st), 0.36, 0.09);
      plant(st, st.length - 2.2, -st.side, giveWay, 0.1, 0.1);
    }
    return { root, lights, asphalt, head, pool };
  }, [curve]);

  useEffect(() => { const key = `streets-${roadOf(curve)}`; setLights(key, built.lights); return () => setLights(key, []); }, [built, curve]);
  useFrame(() => {
    const k = Math.max(nightness(), 0.45 * duskness());
    if (built.head) built.head.emissiveIntensity = 0.2 + 7 * k;
    if (built.pool) built.pool.opacity = 0.5 * k;
    // wet in the rain: the asphalt shines
    if (built.asphalt) { built.asphalt.roughness = 0.85 - 0.6 * weather.wet; built.asphalt.metalness = 0.15 * weather.wet; }
  });
  return <primitive object={built.root} />;
}
