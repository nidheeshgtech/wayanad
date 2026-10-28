"use client";
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { HalfFloatType, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget } from "three";
import { mirror } from "@/lib/mirror";

const SCALE = 0.75; // the mirror's resolution, of its box's size in device pixels

/**
 * The rear-view mirror while you reverse (lib/mirror holds its camera and how much it shows). After the frame is drawn
 * (render priority 2, after ImpactFx), the view behind the car is rendered small into a target and drawn, flipped as a
 * mirror is and faded with `amount`, into the box the HUD leaves for it ([data-mirror]). The scene is rendered every
 * other frame (the box redraws every frame), shadows not updated for it. Idle cost: none.
 */
export default function RearMirror() {
  const { gl, scene } = useThree();
  const m = useMemo(() => {
    const half = gl.extensions.has("EXT_color_buffer_half_float") || gl.extensions.has("EXT_color_buffer_float");
    const target = new WebGLRenderTarget(1, 1, { type: half ? HalfFloatType : UnsignedByteType });
    const material = new ShaderMaterial({
      uniforms: { tFrame: { value: target.texture }, uAmount: { value: 0 }, uSize: { value: new Vector2(1, 1) }, uRadius: { value: 0 } },
      transparent: true, depthTest: false, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: /* glsl */ `
        uniform sampler2D tFrame; uniform float uAmount, uRadius; uniform vec2 uSize; varying vec2 vUv;
        void main() {
          vec2 q = abs((vUv - 0.5) * uSize) - (uSize * 0.5 - uRadius);  // rounded corners, in device pixels
          float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
          gl_FragColor = vec4(texture2D(tFrame, vec2(1.0 - vUv.x, vUv.y)).rgb, clamp(0.5 - d, 0.0, 1.0) * uAmount);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const quad = new Scene(), ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new Mesh(new PlaneGeometry(2, 2), material); mesh.frustumCulled = false; quad.add(mesh);
    return { target, material, quad, ortho, box: null as HTMLElement | null, radius: 0, frame: 0, shown: false, size: new Vector2() };
  }, [gl]);

  useEffect(() => {
    gl.compile(m.quad, m.ortho);
    return () => { mirror.amount = 0; m.target.dispose(); m.material.dispose(); };
  }, [gl, m]);

  useFrame(() => {
    if (mirror.amount < 0.01) { m.shown = false; return; }
    if (!m.box?.isConnected) {
      m.box = document.querySelector<HTMLElement>("[data-mirror]");
      if (!m.box) return;
      m.radius = parseFloat(getComputedStyle(m.box).borderTopLeftRadius) || 0; // its rim's corners (Drive.module.scss .mirror)
    }
    const r = m.box.getBoundingClientRect(), c = gl.domElement.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const pr = gl.getPixelRatio(), w = Math.round(r.width * pr * SCALE), h = Math.round(r.height * pr * SCALE), cam = mirror.camera;
    let fresh = !m.shown;
    if (m.target.width !== w || m.target.height !== h) { m.target.setSize(w, h); fresh = true; }
    if (Math.abs(cam.aspect - r.width / r.height) > 1e-3) { cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); }
    if (fresh || (m.frame = (m.frame + 1) % 2) === 0) {
      const shadows = gl.shadowMap.autoUpdate;
      gl.shadowMap.autoUpdate = false;
      gl.setRenderTarget(m.target);
      try { gl.render(scene, cam); } finally { gl.setRenderTarget(null); gl.shadowMap.autoUpdate = shadows; }
    }
    m.shown = true;
    const u = m.material.uniforms;
    u.uAmount.value = mirror.amount; u.uSize.value.set(r.width * pr, r.height * pr); u.uRadius.value = m.radius * pr;
    // into the box (the viewport's origin is the canvas's bottom left), over the frame already drawn
    const x = r.left - c.left, y = c.bottom - r.bottom, autoClear = gl.autoClear;
    gl.setViewport(x, y, r.width, r.height); gl.setScissor(x, y, r.width, r.height); gl.setScissorTest(true);
    gl.autoClear = false;
    try { gl.render(m.quad, m.ortho); } finally {
      gl.autoClear = autoClear; gl.setScissorTest(false);
      gl.getSize(m.size); gl.setViewport(0, 0, m.size.x, m.size.y);
    }
  }, 2);
  return null;
}
