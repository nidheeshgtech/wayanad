"use client";
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { HalfFloatType, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget } from "three";
import { impact, stepImpact } from "@/lib/impact";
import { game } from "@/lib/game";
import { loading } from "@/lib/loading";
import type { InstancedMesh, Object3D } from "three";

/**
 * What a collision looks like (lib/impact holds the strength and fades it): a brief red flash and a red vignette at
 * the edges (a DOM layer over the canvas: free when idle), and for the moment of impact a soft radial blur with
 * colour fringing toward the edges. That last part needs the frame as a texture, so this takes over drawing the frame
 * (render priority 1): normally it just renders the scene as R3F would; while an impact shows it renders into a
 * multisampled target and draws it through the fringe/blur shader, tone-mapped as usual. Idle cost: none.
 */
export default function ImpactFx() {
  const { gl, scene, camera } = useThree();
  const fx = useMemo(() => {
    // half float keeps the light above white for the tone mapping, where the phone can draw into it; else 8-bit
    const half = gl.extensions.has("EXT_color_buffer_half_float") || gl.extensions.has("EXT_color_buffer_float");
    const target = new WebGLRenderTarget(1, 1, { type: half ? HalfFloatType : UnsignedByteType, samples: 4 });
    const material = new ShaderMaterial({
      uniforms: { tFrame: { value: target.texture }, uAmount: { value: 0 } },
      depthTest: false, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader: /* glsl */ `
        uniform sampler2D tFrame; uniform float uAmount; varying vec2 vUv;
        void main() {
          float edge = 2.0 * dot(vUv - 0.5, vUv - 0.5);  // 0 at the centre, 1 in the corners
          vec2 dir = (vUv - 0.5) * edge;                // fringing and blur grow toward the edges, none in the middle
          float ca = 0.035 * uAmount, blur = 0.05 * uAmount;
          vec3 c = vec3(0.0);
          for (int i = 0; i < 6; i++) {
            vec2 o = -dir * blur * (float(i) / 5.0);    // a short pull toward the centre: impact blur
            c.r += texture2D(tFrame, vUv + o + dir * ca).r;
            c.g += texture2D(tFrame, vUv + o).g;
            c.b += texture2D(tFrame, vUv + o - dir * ca).b;
          }
          gl_FragColor = vec4(c / 6.0, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const quad = new Scene(), ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new Mesh(new PlaneGeometry(2, 2), material); mesh.frustumCulled = false; quad.add(mesh);
    return { target, material, quad, ortho, size: new Vector2(), warmed: false };
  }, [gl]);

  // the red layer: a flash over everything and a vignette at the edges, both driven straight from impact each frame
  const overlay = useMemo(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;inset:0;z-index:3;pointer-events:none;opacity:0;"
      + "background:radial-gradient(ellipse at center, rgba(160,0,0,0) 45%, rgba(150,8,8,.55) 85%, rgba(120,0,0,.85) 100%);";
    const flash = document.createElement("div");
    flash.style.cssText = "position:absolute;inset:0;background:rgb(170,16,16);opacity:0;";
    el.appendChild(flash);
    return { el, flash };
  }, []);
  useEffect(() => {
    if (!overlay) return;
    document.body.appendChild(overlay.el);
    gl.compile(fx.quad, fx.ortho); // compiled now, not on the first hit
    return () => { overlay.el.remove(); fx.target.dispose(); fx.material.dispose(); };
  }, [gl, fx, overlay]);

  useFrame((_, dt) => {
    // drawing into the target uses other variants of every material's shader (no tone mapping there): compile them
    // once everything has loaded, as components/scene/Warmup does for the screen, or the first hit would stall
    if (!fx.warmed && loading.ready) {
      fx.warmed = true;
      const hidden: Object3D[] = [];
      const culled: Object3D[] = [], empty: InstancedMesh[] = [];
      scene.traverse((o) => {
        if (!o.visible) { hidden.push(o); o.visible = true; }
        if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
        if ((o as InstancedMesh).isInstancedMesh && (o as InstancedMesh).count === 0) { empty.push(o as InstancedMesh); (o as InstancedMesh).count = 1; } // drawing none, it'd be skipped
      });
      gl.getDrawingBufferSize(fx.size); fx.target.setSize(fx.size.x, fx.size.y); // allocated now, at full size
      gl.setRenderTarget(fx.target);
      try { gl.render(scene, camera); gl.setRenderTarget(null); gl.render(fx.quad, fx.ortho); } finally {
        gl.setRenderTarget(null);
        for (const o of hidden) o.visible = false;
        for (const o of culled) o.frustumCulled = true;
        for (const o of empty) o.count = 0;
      }
    }
    if (!game.paused) stepImpact(Math.min(dt, 0.1));
    const glow = impact.glow;
    if (overlay) {
      overlay.el.style.opacity = glow > 0.002 ? String(Math.min(1, glow * 0.9)) : "0";
      overlay.flash.style.opacity = String(impact.flash * 0.28);
    }
    if (glow < 0.04) { gl.render(scene, camera); return; }
    gl.getDrawingBufferSize(fx.size);
    if (fx.target.width !== fx.size.x || fx.target.height !== fx.size.y) fx.target.setSize(fx.size.x, fx.size.y);
    fx.material.uniforms.uAmount.value = glow;
    gl.setRenderTarget(fx.target); gl.render(scene, camera);
    gl.setRenderTarget(null); gl.render(fx.quad, fx.ortho);
  }, 1);
  return null;
}
