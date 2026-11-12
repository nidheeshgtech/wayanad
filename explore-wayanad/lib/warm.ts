import type { Camera, Material, Object3D, Scene, Texture, WebGLRenderer } from "three";

/**
 * Background warm-up for things that load during the drive (the cast of 3D people: lib/people). The first time a
 * new material is drawn the GPU compiles its shader and uploads its textures — on a phone 50–200 ms, a visible jolt
 * just as someone walks into view. Here each newly loaded model is compiled (asynchronously where the browser can)
 * and its textures uploaded, one model at a time with a pause between, as soon as it has downloaded — well before
 * anyone wearing it appears. components/scene/Warmup registers the renderer once the scene is ready.
 */
let target: { gl: WebGLRenderer; camera: Camera; scene: Scene } | null = null;
const queue: Object3D[] = [];
let busy = false;

export function setWarmTarget(gl: WebGLRenderer, camera: Camera, scene: Scene) {
  target = { gl, camera, scene };
  void pump();
}

/** Queue a loaded model (its materials are shared by every copy made from it). */
export function warmModel(model: Object3D) {
  queue.push(model);
  void pump();
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function pump() {
  if (busy || !target) return;
  busy = true;
  try {
    for (let model = queue.shift(); model && target; model = queue.shift()) {
      const { gl, camera, scene } = target;
      // shadow-casting like the copies made from it, so the shadow variant is compiled too
      model.traverse((o) => { (o as { castShadow?: boolean }).castShadow = true; });
      try { await gl.compileAsync(model, camera, scene); } catch { /* compiled on first draw instead */ }
      const textures = new Set<Texture>();
      model.traverse((o) => {
        const mats = (o as { material?: Material | Material[] }).material;
        for (const m of mats ? ([] as Material[]).concat(mats) : []) for (const v of Object.values(m)) if ((v as Texture)?.isTexture) textures.add(v as Texture);
      });
      for (const t of textures) { gl.initTexture(t); await pause(16); } // (one upload a frame, not all at once)
      await pause(120);
    }
  } finally { busy = false; }
}
