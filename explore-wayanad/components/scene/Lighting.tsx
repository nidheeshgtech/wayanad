"use client";
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { scrollState } from "@/lib/scrollState";
import { game } from "@/lib/game";
import { stepWeather, weather } from "@/lib/weather";
import { BackSide, Color, DirectionalLight, Mesh, Object3D, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, Vector3 } from "three";

/** A morning sun in the east (+x), a little north; its strength follows lib/weather. */
export const SUN_DIR = new Vector3(0.82, 0.5, -0.28).normalize();
const SHADOW = { span: 22, distance: 70 }; // the shadowed box follows the camera: ±22 units (220 m) square

/**
 * Daylight for physically based materials, and the weather's clock (lib/weather steps here, once a frame). The sky light
 * is an environment map rendered from a sky gradient (pale horizon, soft blue zenith, a glow toward the sun, dark forest
 * below), dimmed as cloud builds, so everything is lit
 * softly from all around without downloading an HDR photo. The sun casts soft shadows in a box that travels with the
 * camera, so detail near the road stays sharp over the whole 12 km.
 */
export default function Lighting({ sunRef, shadows }: { sunRef: React.MutableRefObject<DirectionalLight | null>; shadows: boolean }) {
  const { gl, scene, camera } = useThree();
  const target = useMemo(() => new Object3D(), []);

  useEffect(() => {
    const sky = new Scene();
    sky.add(new Mesh(new SphereGeometry(10, 48, 24), new ShaderMaterial({
      side: BackSide,
      uniforms: {
        horizon: { value: new Color(0xdde6ec) }, zenith: { value: new Color(0x7fa7d4) }, ground: { value: new Color(0x26332a) },
        sun: { value: new Color(0xfff1d6) }, sunDir: { value: SUN_DIR },
      },
      vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        uniform vec3 horizon, zenith, ground, sun, sunDir; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 c = d.y > 0.0 ? mix(horizon, zenith, pow(d.y, 0.6)) : mix(horizon * 0.6, ground, smoothstep(0.0, 0.25, -d.y));
          c += sun * (pow(max(dot(d, sunDir), 0.0), 8.0) * 1.2 + pow(max(dot(d, sunDir), 0.0), 200.0) * 6.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
    })));
    const pmrem = new PMREMGenerator(gl), env = pmrem.fromScene(sky, 0.02);
    scene.environment = env.texture;
    scene.environmentIntensity = 1.0;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);

  useEffect(() => {
    const sun = sunRef.current;
    if (!sun) return;
    scene.add(target);
    sun.target = target;
    return () => { scene.remove(target); };
  }, [scene, sunRef, target]);

  useFrame((_, dt) => {
    if (!game.paused) stepWeather(dt, scrollState.act === "churam" ? scrollState.progress : 1); // drive mode: Space holds the weather too
    // clouds over the sun: direct light fades to a quarter (shadows soften with it); sky light dims a little
    scene.environmentIntensity = (1.1 - 0.35 * weather.cloud) * (1 - 0.45 * weather.gloom);
    const sun = sunRef.current;
    if (!sun) return;
    sun.intensity = (0.8 + 3.0 * weather.sun) * (1 - 0.2 * weather.mist) * (1 - 0.6 * weather.gloom);
    target.position.copy(camera.position);
    sun.position.copy(camera.position).addScaledVector(SUN_DIR, SHADOW.distance);
    target.updateMatrixWorld();
  });

  return (
    <directionalLight
      ref={sunRef}
      color={0xfff1dc}
      intensity={3.2}
      castShadow={shadows}
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-SHADOW.span}
      shadow-camera-right={SHADOW.span}
      shadow-camera-top={SHADOW.span}
      shadow-camera-bottom={-SHADOW.span}
      shadow-camera-near={1}
      shadow-camera-far={SHADOW.distance * 2}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
    />
  );
}
