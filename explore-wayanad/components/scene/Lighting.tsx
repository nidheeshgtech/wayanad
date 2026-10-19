"use client";
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { BackSide, Color, DirectionalLight, Mesh, Object3D, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, Vector3 } from "three";

/** A morning sun low in the east (+x), a little north: long, soft shadows across the road. */
export const SUN_DIR = new Vector3(0.82, 0.5, -0.28).normalize();
const SHADOW = { span: 22, distance: 70 }; // the shadowed box follows the camera: ±22 units (220 m) square

/**
 * Daylight for physically based materials. The sky light is an environment map rendered from a misty-morning sky
 * gradient (pale horizon, soft blue-grey zenith, warm glow toward the sun, dark forest below), so everything is lit
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
        horizon: { value: new Color(0xd9e0db) }, zenith: { value: new Color(0x9fb4c6) }, ground: { value: new Color(0x26332a) },
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
    scene.environmentIntensity = 0.85;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);

  useEffect(() => {
    const sun = sunRef.current;
    if (!sun) return;
    scene.add(target);
    sun.target = target;
    return () => { scene.remove(target); };
  }, [scene, sunRef, target]);

  useFrame(() => {
    const sun = sunRef.current;
    if (!sun) return;
    target.position.copy(camera.position);
    sun.position.copy(camera.position).addScaledVector(SUN_DIR, SHADOW.distance);
    target.updateMatrixWorld();
  });

  return (
    <directionalLight
      ref={sunRef}
      color={0xfff0d8}
      intensity={2.2}
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
