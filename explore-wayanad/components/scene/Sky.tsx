"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BackSide, Color, DirectionalLight, FogExp2, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from "three";

/**
 * Gradient dome that follows the camera: fog colour at the horizon (so distant ridges dissolve into it),
 * the act's sky colour overhead, and a soft warm glow toward the sun — the scene's one amber accent.
 */
export default function Sky({ sunRef }: { sunRef: React.MutableRefObject<DirectionalLight | null> }) {
  const mesh = useRef<Mesh>(null);
  const material = useMemo(() => new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: {
      horizon: { value: new Color() }, top: { value: new Color() },
      sunDir: { value: new Vector3(0, 1, 0) }, sunColor: { value: new Color(0xd9a441) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 horizon, top, sunDir, sunColor;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        vec3 col = mix(horizon, top, smoothstep(-0.05, 0.6, dir.y));
        float sun = max(dot(dir, normalize(sunDir)), 0.0);
        col += sunColor * (pow(sun, 6.0) * 0.18 + pow(sun, 64.0) * 0.35) * (1.0 - smoothstep(0.2, 0.9, dir.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }), []);

  useFrame(({ camera, scene }) => {
    if (!mesh.current) return;
    mesh.current.position.copy(camera.position);
    const u = material.uniforms;
    if (scene.fog) u.horizon.value.copy((scene.fog as FogExp2).color);
    if (scene.background instanceof Color) u.top.value.copy(scene.background).multiplyScalar(0.82);
    if (sunRef.current) u.sunDir.value.copy(sunRef.current.position).normalize();
  });

  return <mesh ref={mesh} geometry={useMemo(() => new SphereGeometry(350, 32, 16), [])} material={material} renderOrder={-1} frustumCulled={false} />;
}
