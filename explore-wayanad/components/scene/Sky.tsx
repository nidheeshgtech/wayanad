"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, Color, FogExp2, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";
import { SUN_DIR } from "./Lighting";
import { AIR_LINEAR } from "@/lib/atmosphere";

/**
 * Sky dome that follows the camera: the act's sky colour overhead, the same pale haze as the land's aerial perspective at
 * the horizon (so ridges fade into the sky without a seam), a soft sun, and slow cumulus from layered noise.
 * Under the storyboard's fog (hairpins 7–8) it whitens with the fog colour.
 */
export default function Sky() {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(() => new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new Color() }, haze: { value: new Vector3(...AIR_LINEAR) }, fogColor: { value: new Color() }, fogAmount: { value: 0 },
      sunDir: { value: SUN_DIR }, sunColor: { value: new Color(0xfff1d6) }, time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, haze, fogColor, sunDir, sunColor;
      uniform float fogAmount, time;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec3 dir = normalize(vDir);
        vec3 horizon = mix(haze, fogColor, 0.35);
        vec3 col = mix(horizon, top, smoothstep(0.0, 0.45, dir.y));
        if (dir.y < 0.0) col = horizon;
        // clouds on a flat layer overhead: projected so they shrink toward the horizon
        if (dir.y > 0.02) {
          vec2 uv = dir.xz / (dir.y + 0.12) * 0.9 + vec2(time * 0.004, time * 0.0015);
          float c = smoothstep(0.52, 0.78, fbm(uv));
          float shade = 0.82 + 0.18 * smoothstep(0.4, 0.9, fbm(uv * 1.7 + 3.1));
          col = mix(col, vec3(0.96, 0.97, 0.98) * shade, c * smoothstep(0.02, 0.25, dir.y) * 0.9);
        }
        float sun = max(dot(dir, normalize(sunDir)), 0.0);
        col += sunColor * (pow(sun, 8.0) * 0.25 + pow(sun, 400.0) * 4.0);
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
    if (fog) { u.fogColor.value.copy(fog.color); u.fogAmount.value = Math.min(1, Math.max(0, (fog.density - 0.01) / 0.05)); }
    if (scene.background instanceof Color) u.top.value.copy(scene.background);
  });

  return <mesh ref={mesh} geometry={useMemo(() => new SphereGeometry(350, 48, 24), [])} material={material} renderOrder={-1} frustumCulled={false} />;
}
