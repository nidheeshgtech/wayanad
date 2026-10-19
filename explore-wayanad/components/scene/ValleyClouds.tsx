"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, Color, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, type WebGLProgramParametersWithUniforms } from "three";
import { height, roadDistance, terrainGrid } from "@/lib/terrain";

/* Low cloud lying in the valleys below the churam, as in monsoon drone footage: big soft banks over low ground, away from
 * the road, seen from above as you climb. Camera-facing cards (billboarded in the vertex shader), drifting slowly,
 * fading out as you get close so you never fly into a flat card. Units of 10 m. */
const CLOUD = { count: 160, size: [14, 34], above: [2, 9], maxGround: 30, roadClear: 12, fadeNear: [4, 16] };

/** A soft, lumpy puff: overlapping radial blobs, white with alpha. */
function puff() {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d")!;
  for (let k = 0; k < 28; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 70, cx = 128 + Math.cos(a) * r, cy = 140 + Math.sin(a) * r * 0.5, rad = 35 + Math.random() * 45;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, "rgba(255,255,255,0.32)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  }
  return new CanvasTexture(c);
}

const time = { value: 0 };
const billboard = (shader: WebGLProgramParametersWithUniforms) => {
  shader.uniforms.uTime = time;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nuniform float uTime;")
    .replace("#include <project_vertex>", `
      vec4 centre = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0) + vec4(uTime * 0.02, 0.0, uTime * 0.008, 0.0);
      vec4 mvPosition = modelViewMatrix * centre;
      mvPosition.xy += position.xy * length(instanceMatrix[0].xyz);
      gl_Position = projectionMatrix * mvPosition;`);
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <fog_fragment>",
    `diffuseColor.a *= smoothstep(${CLOUD.fadeNear[0].toFixed(1)}, ${CLOUD.fadeNear[1].toFixed(1)}, vFogDepth);
    gl_FragColor.a = diffuseColor.a;
    #include <fog_fragment>`,
  );
};

export default function ValleyClouds({ count = CLOUD.count }: { count?: number }) {
  const mesh = useMemo(() => {
    const grid = terrainGrid();
    const material = new MeshBasicMaterial({ map: puff(), color: new Color(0xdde3e6), transparent: true, depthWrite: false, opacity: 0.9 });
    material.onBeforeCompile = billboard;
    material.customProgramCacheKey = () => "valley-clouds-1";
    const mesh = new InstancedMesh(new PlaneGeometry(1, 0.55), material, count);
    if (!grid) { mesh.count = 0; return mesh; }
    const m = new Matrix4();
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 40; tries++) {
      const x = grid.west + Math.random() * grid.width, z = grid.north + Math.random() * grid.length, g = height(x, z);
      if (g > CLOUD.maxGround || roadDistance(x, z) < CLOUD.roadClear) continue; // valleys and lowland only, off the road
      const s = CLOUD.size[0] + Math.random() * (CLOUD.size[1] - CLOUD.size[0]);
      m.makeScale(s, s, s).setPosition(x, g + CLOUD.above[0] + Math.random() * (CLOUD.above[1] - CLOUD.above[0]), z);
      mesh.setMatrixAt(placed++, m);
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    mesh.name = "valley-clouds";
    return mesh;
  }, [count]);
  useFrame((_, dt) => { time.value += dt; });
  return <primitive object={mesh} />;
}
