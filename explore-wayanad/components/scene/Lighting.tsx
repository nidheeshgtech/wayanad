"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { scrollState } from "@/lib/scrollState";
import { game } from "@/lib/game";
import { stepWeather, weather } from "@/lib/weather";
import { duskness, stepTheme } from "@/lib/theme";
import { BackSide, Color, DirectionalLight, Mesh, Object3D, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, Texture, Vector3 } from "three";

/** The sun's direction, shared by the sky, the shadows and the haze: a morning sun in the east (+x), a little north, or
 * at dusk (lib/theme) low in the west-north-west, just over the ridges. Its strength follows lib/weather. */
const SUN_DAY = new Vector3(0.82, 0.5, -0.28).normalize(), SUN_DUSK = new Vector3(-0.9, 0.07, -0.42).normalize();
export const SUN_DIR = SUN_DAY.clone();
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
  const target = useMemo(() => new Object3D(), []), lightDir = useMemo(() => new Vector3(), []);

  // the sky light: an environment map from a sky gradient, one for the day and one for dusk (deep blue overhead, a warm
  // glow along the western horizon, darker all round); a switch crosses over at the middle of the fade
  const envs = useRef<{ day: Texture; dusk: Texture } | null>(null);
  useEffect(() => {
    const sky = new Scene(), uniforms = {
      horizon: { value: new Color(0xdde6ec) }, zenith: { value: new Color(0x7fa7d4) }, ground: { value: new Color(0x26332a) },
      sun: { value: new Color(0xfff1d6) }, sunDir: { value: SUN_DAY.clone() },
    };
    sky.add(new Mesh(new SphereGeometry(10, 48, 24), new ShaderMaterial({
      side: BackSide, uniforms,
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
    const pmrem = new PMREMGenerator(gl), day = pmrem.fromScene(sky, 0.02);
    uniforms.horizon.value.set(0xc98a6a); uniforms.zenith.value.set(0x2d3f66); uniforms.ground.value.set(0x141a17);
    uniforms.sun.value.set(0xff9a55).multiplyScalar(0.6); uniforms.sunDir.value.copy(SUN_DUSK);
    const dusk = pmrem.fromScene(sky, 0.02);
    envs.current = { day: day.texture, dusk: dusk.texture };
    scene.environment = duskness() > 0.5 ? dusk.texture : day.texture;
    scene.environmentIntensity = 1.0;
    return () => { scene.environment = null; envs.current = null; day.dispose(); dusk.dispose(); pmrem.dispose(); };
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
    stepTheme(dt);
    const e = duskness();
    SUN_DIR.copy(SUN_DAY).lerp(SUN_DUSK, e).normalize();
    if (envs.current) { const want = e > 0.5 ? envs.current.dusk : envs.current.day; if (scene.environment !== want) scene.environment = want; }
    // clouds over the sun: direct light fades to a quarter (shadows soften with it); sky light dims a little.
    // At dusk the sky light is lower and the sun a low, weaker orange (its colour: Director)
    scene.environmentIntensity = (1.1 - 0.35 * weather.cloud) * (1 - 0.45 * weather.gloom) * (1 - 0.15 * e);
    const sun = sunRef.current;
    if (!sun) return;
    sun.intensity = (0.8 + 3.0 * weather.sun) * (1 - 0.2 * weather.mist) * (1 - 0.6 * weather.gloom) * (1 - 0.65 * e);
    target.position.copy(camera.position);
    // the light itself never comes from lower than ~17°: a true dusk sun would put whole slopes in shadow
    lightDir.copy(SUN_DIR); lightDir.y = Math.max(0.3, lightDir.y); lightDir.normalize();
    sun.position.copy(camera.position).addScaledVector(lightDir, SHADOW.distance);
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
