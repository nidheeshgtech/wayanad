"use client";
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, HalfFloatType, LinearFilter, Mesh, NoBlending, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget } from "three";
import { impact, stepImpact } from "@/lib/impact";
import { game } from "@/lib/game";
import { loading } from "@/lib/loading";
import { duskness, nightness } from "@/lib/theme";
import { weather } from "@/lib/weather";
import type { InstancedMesh, Object3D } from "three";

/**
 * Drive mode's last step (render priority 1): how the frame reaches the screen.
 *
 *  - Glow (bloom): lamps, tail lights, the police light bar, lit windows and signs spill soft light round themselves.
 *    Bright parts of the frame are picked out, blurred down a chain of ever smaller copies and added back. At dusk a
 *    little, at night a lot.
 *  - The night grade: the moonlit greys go deep blue-violet and the shadows sink, so the lights carry the picture.
 *  - Speed: with nitro the edges of the frame pull toward the middle with a little colour fringing (and a touch of
 *    it at plain high speed).
 *  - A collision (lib/impact): a brief red flash and a red vignette (a DOM layer over the canvas: free when idle), and
 *    a stronger version of the speed pull with colour fringing at the moment of impact.
 *
 * Any of those needs the frame as a texture: it is rendered into a multisampled half-float target (light above white
 * kept for the glow and the tone mapping) and drawn through the passes; with none of them (daytime, cruising) the scene
 * is drawn straight to the screen as R3F would. `post` false (phones, for now): straight to the screen always, only the
 * red DOM layer for a hit (drawing the world into a texture there was a second-long stall on the first hit on an iPhone).
 */
const BLOOM = { levels: 5, threshold: 0.95, knee: 0.45, dusk: 0.35, night: 1.0, rain: 0.25 };

const VERT = "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
const pass = (fragmentShader: string, uniforms: Record<string, { value: unknown }>, additive = false) =>
  new ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false, blending: additive ? AdditiveBlending : NoBlending, transparent: additive, toneMapped: false });

export default function DriveFx({ post = true }: { post?: boolean }) {
  const { gl, scene, camera } = useThree();
  const fx = useMemo(() => {
    // half float keeps the light above white for the glow and the tone mapping, where the phone can draw into it; else 8-bit
    const half = gl.extensions.has("EXT_color_buffer_half_float") || gl.extensions.has("EXT_color_buffer_float");
    const type = half ? HalfFloatType : UnsignedByteType;
    const target = new WebGLRenderTarget(1, 1, { type, samples: 4 });
    const mips = Array.from({ length: BLOOM.levels }, () => new WebGLRenderTarget(1, 1, { type, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false }));

    // the bright parts, at half size: a soft threshold (a knee, so a lamp's edge fades in rather than snapping)
    const bright = pass(/* glsl */ `
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold, uKnee; varying vec2 vUv;
      void main() {
        vec3 s = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb
               + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        s = min(s * 0.25, vec3(3.0));                     // (one hot pixel mustn't flare the whole screen)
        float br = max(s.r, max(s.g, s.b));
        float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
        gl_FragColor = vec4(s * max(soft, br - uThreshold) / max(br, 1e-4), 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uThreshold: { value: BLOOM.threshold }, uKnee: { value: BLOOM.knee } });
    // down the chain (dual Kawase: five taps), then back up it, each level added onto the one above (eight taps)
    const down = pass(/* glsl */ `
      uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
        c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new Vector2() } });
    const up = pass(/* glsl */ `
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uSpread; varying vec2 vUv;
      void main() {
        vec2 t = uTexel * uSpread;
        vec3 c = texture2D(tSrc, vUv + t * vec2(-2.0, 0.0)).rgb + texture2D(tSrc, vUv + t * vec2(2.0, 0.0)).rgb
               + texture2D(tSrc, vUv + t * vec2(0.0, -2.0)).rgb + texture2D(tSrc, vUv + t * vec2(0.0, 2.0)).rgb;
        c += 2.0 * (texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb + texture2D(tSrc, vUv + t * vec2(1.0, -1.0)).rgb
                  + texture2D(tSrc, vUv + t * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + t * vec2(1.0, 1.0)).rgb);
        gl_FragColor = vec4(c / 12.0, 1.0);
      }`, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uSpread: { value: 1 } }, true);

    // the frame: the speed / impact pull with fringing, the glow added, the night grade, a vignette; then tone mapped
    const final = new ShaderMaterial({
      uniforms: { tFrame: { value: target.texture }, tBloom: { value: mips[0].texture }, uBloom: { value: 0 }, uNight: { value: 0 }, uPull: { value: 0 }, uFringe: { value: 0 }, uVignette: { value: 0 }, uLift: { value: 0 } },
      depthTest: false, depthWrite: false,
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tFrame, tBloom; uniform float uBloom, uNight, uPull, uFringe, uVignette, uLift; varying vec2 vUv;
        void main() {
          vec2 d = vUv - 0.5;
          float edge = 2.0 * dot(d, d);                    // 0 at the centre, 1 in the corners
          vec2 dir = d * edge;                             // the pull and the fringing grow toward the edges, none in the middle
          vec3 c = vec3(0.0);
          if (uPull + uFringe < 0.0005) c = texture2D(tFrame, vUv).rgb;
          else {
            for (int i = 0; i < 8; i++) {
              vec2 o = -dir * uPull * (float(i) / 7.0);    // a short pull toward the centre
              c.r += texture2D(tFrame, vUv + o + dir * uFringe).r;
              c.g += texture2D(tFrame, vUv + o).g;
              c.b += texture2D(tFrame, vUv + o - dir * uFringe).b;
            }
            c /= 8.0;
          }
          c += texture2D(tBloom, vUv).rgb * uBloom;
          if (uNight > 0.0) {
            // moonlight goes violet-blue and the darks sink; what's lit (lamps, the glow) keeps its own colour
            float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
            float lit = smoothstep(0.12, 0.75, l);
            // lamplight: strongly orange pixels (sodium lamps, a lit stone, a shop's warm counter) keep their warmth even
            // when dim; plain night violet over them reads pink. Soil and wood are too weakly orange to count.
            lit = max(lit, 0.85 * smoothstep(0.7, 0.9, (c.r - c.b) / max(c.r, 1e-4)) * smoothstep(0.004, 0.03, c.r));
            vec3 cool = vec3(l) * vec3(0.6, 0.52, 1.2) + (c - vec3(l)) * 0.8;  // tinted indigo, a little desaturated
            vec3 g = mix(cool * 0.78, c * 1.1, lit);
            g = g * (0.75 + 0.25 * smoothstep(0.0, 0.06, l)); // the deepest shadows a little deeper
            g += vec3(0.005, 0.0015, 0.013) * (1.0 - lit); // a faint violet floor in the blacks
            g *= 1.0 + uLift * (1.0 - lit);               // rain: the murk is darker still, lift it back so the road reads
            c = mix(c, g, uNight);
          }
          c *= 1.0 - uVignette * smoothstep(0.15, 1.0, edge);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const quad = new Scene(), ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new Mesh(new PlaneGeometry(2, 2), final); mesh.frustumCulled = false; quad.add(mesh);
    return { target, mips, bright, down, up, final, mesh, quad, ortho, size: new Vector2(), warmed: false, warmT: 0, pull: 0 };
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
    if (post) for (const m of [fx.bright, fx.down, fx.up, fx.final]) { fx.mesh.material = m; gl.compile(fx.quad, fx.ortho); } // compiled now, not when first needed
    fx.mesh.material = fx.final;
    return () => { overlay.el.remove(); fx.target.dispose(); for (const t of fx.mips) t.dispose(); for (const m of [fx.bright, fx.down, fx.up, fx.final]) m.dispose(); };
  }, [gl, fx, overlay, post]);

  /** One full-screen pass of `material` into `target` (null: the screen). */
  const draw = (material: ShaderMaterial, target: WebGLRenderTarget | null) => {
    fx.mesh.material = material;
    gl.setRenderTarget(target); gl.render(fx.quad, fx.ortho);
  };

  useFrame((_, dt) => {
    // drawing into the target uses other variants of every material's shader (no tone mapping there): compile them
    // once everything has loaded, as components/scene/Warmup does for the screen, or the first night frame or hit
    // would stall (after Start, a moment in: by then the forest, towns and traffic have all been built)
    if (post && !fx.warmed && loading.ready && game.started && (fx.warmT += dt) > 1.5) {
      fx.warmed = true;
      // compiled for the target, not drawn: drawing the whole world unculled into it was one frame of seconds on a
      // phone, just as the start screen came up
      const hidden: Object3D[] = [], empty: InstancedMesh[] = [];
      scene.traverse((o) => {
        if (!o.visible) { hidden.push(o); o.visible = true; }
        if ((o as InstancedMesh).isInstancedMesh && (o as InstancedMesh).count === 0) { empty.push(o as InstancedMesh); (o as InstancedMesh).count = 1; } // drawing none, it'd be skipped
      });
      gl.getDrawingBufferSize(fx.size); fx.target.setSize(fx.size.x, fx.size.y); // allocated now, at full size
      gl.setRenderTarget(fx.target);
      try { void gl.compileAsync(scene, camera).catch(() => {}); } finally {
        gl.setRenderTarget(null);
        for (const o of hidden) o.visible = false;
        for (const o of empty) o.count = 0;
      }
    }
    if (!game.paused) stepImpact(Math.min(dt, 0.1));
    const glow = impact.glow;
    if (overlay) {
      overlay.el.style.opacity = glow > 0.002 ? String(Math.min(1, glow * 0.9)) : "0";
      overlay.flash.style.opacity = String(impact.flash * 0.28);
    }

    // how much of each: the glow from dusk on (more in rain: wet air), the grade at night, the pull with nitro
    const n = nightness(), e = duskness();
    const bloom = Math.max(BLOOM.dusk * e, BLOOM.night * n) * (1 + BLOOM.rain * weather.rain);
    fx.pull += ((game.boosting && !game.paused ? 1 : 0) - fx.pull) * Math.min(1, dt * (game.boosting ? 4 : 2.5));
    const speed = fx.pull * (0.6 + 0.4 * Math.min(1, game.speedFx));
    const hit = glow >= 0.04 ? glow : 0;
    if (!post || (bloom < 0.01 && speed < 0.01 && hit === 0)) { gl.render(scene, camera); return; }

    gl.getDrawingBufferSize(fx.size);
    if (fx.target.width !== fx.size.x || fx.target.height !== fx.size.y) {
      fx.target.setSize(fx.size.x, fx.size.y);
      fx.mips.forEach((t, i) => t.setSize(Math.max(1, fx.size.x >> (i + 1)), Math.max(1, fx.size.y >> (i + 1))));
    }
    gl.setRenderTarget(fx.target); gl.render(scene, camera);

    const u = fx.final.uniforms;
    if (bloom >= 0.01) {
      const src = (m: ShaderMaterial, t: WebGLRenderTarget) => { m.uniforms.tSrc.value = t.texture; (m.uniforms.uTexel.value as Vector2).set(1 / t.width, 1 / t.height); };
      src(fx.bright, fx.target); draw(fx.bright, fx.mips[0]);
      for (let i = 1; i < fx.mips.length; i++) { src(fx.down, fx.mips[i - 1]); draw(fx.down, fx.mips[i]); }
      const clear = gl.autoClear; gl.autoClear = false;
      try { for (let i = fx.mips.length - 1; i > 0; i--) { src(fx.up, fx.mips[i]); draw(fx.up, fx.mips[i - 1]); } } finally { gl.autoClear = clear; }
    }
    u.uBloom.value = bloom >= 0.01 ? bloom : 0;
    u.uNight.value = n;
    u.uLift.value = 0.7 * n * Math.min(1, weather.gloom + 0.5 * weather.rain);
    u.uPull.value = 0.05 * hit + 0.045 * speed;
    u.uFringe.value = 0.035 * hit + 0.008 * speed;
    u.uVignette.value = 0.38 * n + 0.25 * speed;
    draw(fx.final, null);
  }, 1);
  return null;
}
