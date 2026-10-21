"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, Color, FogExp2, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { SUN_DIR } from "./Lighting";
import { AIR_LINEAR } from "@/lib/atmosphere";
import { weather } from "@/lib/weather";
import { duskness, nightness } from "@/lib/theme";

/**
 * Sky dome that follows the camera: the act's sky colour overhead, the same pale haze as the land's aerial perspective at
 * the horizon (so ridges fade into the sky without a seam), a soft sun, and slow cumulus from layered noise.
 * Under the storyboard's fog (hairpins 7–8) it whitens with the fog colour.
 */
const MOONLIGHT = new Color(0.85, 0.9, 1.0);

export default function Sky() {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(() => new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new Color() }, haze: { value: new Vector3(...AIR_LINEAR) }, fogColor: { value: new Color() }, fogAmount: { value: 0 },
      sunDir: { value: SUN_DIR }, sunColor: { value: new Color(0xfff1d6) }, time: { value: 0 }, cloud: { value: 0 }, sun: { value: 1 }, gloom: { value: 0 }, dusk: { value: 0 }, night: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, haze, fogColor, sunDir, sunColor;
      uniform float fogAmount, time, cloud, sun, gloom, dusk, night;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec3 dir = normalize(vDir);
        // the horizon haze darkens with the fog under a storm, exactly as the land's (lib/atmosphere), so no seam
        float dayLight = clamp(dot(fogColor, vec3(0.299, 0.587, 0.114)) / 0.6, 0.3, 1.0);
        vec3 horizon = mix(haze, fogColor, 0.35 + 0.45 * dusk) * dayLight;
        vec3 col = mix(horizon, top, smoothstep(0.0, mix(0.45, 0.6, dusk), dir.y));
        if (dir.y < 0.0) col = horizon;
        // dusk: an orange band low over the western ridges, fading up into the blue
        float west = max(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
        col += vec3(1.0, 0.42, 0.16) * dusk * (1.0 - night) * (0.25 + 0.75 * pow(west, 2.5)) * (1.0 - smoothstep(-0.02, 0.32, dir.y)) * 0.55 * (1.0 - 0.7 * cloud);
        // night: stars, thinning toward the horizon and behind cloud (cells on the dome, each with a fixed star or none)
        if (night > 0.0 && dir.y > 0.0) {
          vec2 cell = floor(vec2(atan(dir.z, dir.x) * 160.0, dir.y * 260.0));
          float h = hash(cell), twinkle = 0.75 + 0.25 * sin(time * (1.0 + h * 3.0) + h * 40.0);
          col += vec3(0.85, 0.9, 1.0) * step(0.985, h) * pow(fract(h * 91.7), 3.0) * 1.6 * twinkle * smoothstep(0.03, 0.35, dir.y) * night * (1.0 - cloud * 0.9);
        }
        // clouds on a flat layer overhead: projected so they shrink toward the horizon
        if (dir.y > 0.02) {
          vec2 uv = dir.xz / (dir.y + 0.12) * 0.9 + vec2(time * 0.004, time * 0.0015);
          float c = smoothstep(mix(0.6, 0.3, cloud), mix(0.82, 0.62, cloud), fbm(uv)); // a few clouds when clear, near-full cover when overcast
          float shade = 0.82 + 0.18 * smoothstep(0.4, 0.9, fbm(uv * 1.7 + 3.1));
          // storm cloud (drive mode's downpours, gloom): heavy and slate-grey instead of white
          // at dusk the clouds take the sunset from below: rose toward the west, slate overhead
          vec3 cloudCol = mix(mix(vec3(0.97, 0.98, 0.99), vec3(0.74, 0.77, 0.8), cloud), vec3(0.36, 0.4, 0.43), gloom);
          cloudCol = mix(cloudCol, mix(vec3(0.3, 0.3, 0.42), vec3(1.0, 0.55, 0.42), west * (1.0 - smoothstep(0.1, 0.7, dir.y))) * (1.0 - 0.5 * cloud), dusk);
          cloudCol = mix(cloudCol, vec3(0.07, 0.08, 0.11), night); // moonlit cloud: just darker than the sky
          col = mix(col, cloudCol * shade, c * smoothstep(0.02, 0.25, dir.y) * 0.95);
        }
        float sunDisc = max(dot(dir, normalize(sunDir)), 0.0);
        // the sun (or at night the moon: a smaller, sharper disc with a faint halo)
        col += sunColor * (pow(sunDisc, mix(8.0, 60.0, night)) * mix(0.25, 0.12, night) + pow(sunDisc, mix(400.0, 2500.0, night)) * mix(4.0, 2.2, night)) * (0.15 + 0.85 * sun);
        col = mix(col, fogColor, fogAmount);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), []);

  useFrame(({ camera, scene }, dt) => {
    if (!mesh.current) return;
    mesh.current.position.copy(camera.position);
    const u = material.uniforms, fog = scene.fog as FogExp2 | null;
    u.time.value += dt;
    u.cloud.value = weather.cloud; u.sun.value = weather.sun; u.gloom.value = weather.gloom;
    const e = duskness(), n = nightness(); u.dusk.value = e; u.night.value = n;
    u.sunColor.value.setRGB(1, 0.945 - 0.5 * e, 0.84 - 0.65 * e).lerp(MOONLIGHT, n).multiplyScalar(1 - 0.95 * Math.max(0, 1 - Math.abs(n - 0.5) / 0.2));
    if (fog) { u.fogColor.value.copy(fog.color); u.fogAmount.value = Math.min(1, Math.max(0, (fog.density - 0.01) / 0.05)); }
    if (scene.background instanceof Color) u.top.value.copy(scene.background);
  });

  return <mesh ref={mesh} geometry={useMemo(() => new SphereGeometry(350, 48, 24), [])} material={material} renderOrder={-1} frustumCulled={false} />;
}
