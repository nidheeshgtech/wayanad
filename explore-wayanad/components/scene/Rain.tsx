'use client';
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { InstancedBufferAttribute, InstancedBufferGeometry, BufferAttribute, Mesh, ShaderMaterial, Vector2, Vector3 } from 'three';
import { weather } from '@/lib/weather';
import { game } from '@/lib/game';

/**
 * Rain: streaks falling through two boxes that travel with the camera — a near one (20 m across) where the drops read
 * as streaks, and a far one (100 m) for the depth of the shower. Each drop is a thin quad drawn from its head to its
 * tail and widened in screen space, so it keeps ~1.5–2 px on any screen (1 px lines vanished on phones). Positions
 * come from static seeds and time on the GPU: no per-frame uploads, one draw call. Heavier rain: more drops, faster,
 * longer and brighter.
 */
export default function Rain({ count = 2500, opacity = .4 }: { count?: number; opacity?: number }) {
  const { gl } = useThree();
  const mesh = useMemo(() => {
    const geo = new InstancedBufferGeometry();
    // a quad: x = side (−1, 1), y = 0 at the head, 1 at the tail
    geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), 3));
    geo.setIndex([0, 2, 1, 1, 2, 3]);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) seeds.set([Math.random(), Math.random(), Math.random(), i < count * 0.65 ? 0 : 1], i * 4); // w: 0 near, 1 far
    geo.setAttribute('seed', new InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    const material = new ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 }, eye: { value: new Vector3() }, rain: { value: 0 }, opacity: { value: opacity }, res: { value: new Vector2(1, 1) }, px: { value: 1.6 } },
      vertexShader: /* glsl */ `
        attribute vec4 seed; uniform float time, rain, px; uniform vec3 eye; uniform vec2 res; varying float vFade, vAlong;
        void main() {
          float k = min(rain, 1.4) / 1.4;
          vec3 box = mix(vec3(2.0, 2.0, 2.0), vec3(10.0, 6.0, 10.0), seed.w);          // units of 10 m
          float fall = mix(0.9, 2.2, k) * (0.85 + 0.3 * seed.x);                          // units/s
          vec3 p = mod(seed.xyz * box + vec3(time * 0.08, -time * fall, 0.0) - vec3(eye.x, eye.y, eye.z), box) - box * 0.5 + eye;
          vec3 tail = p + vec3(-0.006, mix(0.05, 0.14, k), 0.0);                          // the streak, up to its tail
          vec4 a = projectionMatrix * viewMatrix * vec4(p, 1.0), b = projectionMatrix * viewMatrix * vec4(tail, 1.0);
          vec4 c = mix(a, b, position.y);
          vec2 dir = normalize((b.xy / b.w - a.xy / a.w) * res + 1e-6);
          c.xy += vec2(-dir.y, dir.x) * position.x * px / res * c.w;                      // widen across the streak, in pixels
          gl_Position = c;
          // near drops brightest; nothing right at the lens
          vFade = (1.0 - 0.55 * seed.w) * smoothstep(0.03, 0.12, a.w);
          vAlong = position.y;
        }`,
      fragmentShader: /* glsl */ `
        uniform float rain, opacity; varying float vFade, vAlong;
        void main() {
          // brightest at the drop, fading up the streak behind it
          gl_FragColor = vec4(0.72, 0.79, 0.85, opacity * min(1.4, rain * 1.15) * vFade * (1.0 - 0.75 * vAlong));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const m = new Mesh(geo, material); m.frustumCulled = false; m.name = 'rain';
    return m;
  }, [count, opacity]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as ShaderMaterial).dispose(); }, [mesh]);
  useFrame(({ camera }, dt) => {
    const u = (mesh.material as ShaderMaterial).uniforms;
    if (!game.paused) u.time.value += Math.min(dt, .1);
    u.eye.value.copy(camera.position); u.rain.value = weather.rain;
    gl.getDrawingBufferSize(u.res.value); u.px.value = 1.6 * Math.max(1, gl.getPixelRatio()); // total width in device pixels: ~1.6 CSS px
    mesh.visible = weather.rain > .02;
    (mesh.geometry as InstancedBufferGeometry).instanceCount = Math.floor(count * Math.min(1, weather.rain / 1.1));
  });
  return <primitive object={mesh} />;
}
