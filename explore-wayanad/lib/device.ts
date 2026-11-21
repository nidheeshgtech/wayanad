/**
 * Weak phones: budget Android graphics chips that can't hold the lite tier's starting level — Mali-G57 MC2 (MediaTek
 * Dimensity 6xxx, the Oppo A6 Pro a player wrote about), Mali-G52/G51 and older, Adreno 3xx–5xx and 610–619, PowerVR
 * GE / IMG BXM — or, when the browser won't name the chip, little memory or few cores. On one the scene is built
 * lighter from the start (components/scene/Scene) and the auto quality starts at its lowest step (Quality), so the
 * drive loads sooner and runs steadier. iPhones only say "Apple GPU": never counted weak here.
 * ?weak=1 / ?weak=0 forces it (testing). Decided once per page.
 */
let verdict: { weak: boolean; gpu: string } | null = null;

const WEAK_GPU = /Mali-(T\d|G3\d|G5[0-7]|G7[0-2])\b|Adreno \(TM\) ([3-5]\d\d|6[01]\d)\b|PowerVR Rogue GE|IMG BXM/i;

export function device() {
  if (verdict) return verdict;
  if (typeof window === "undefined") return { weak: false, gpu: "" };
  let gpu = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    gpu = String((ext && gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl?.getParameter(gl.RENDERER) || "");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {}
  const nav = navigator as Navigator & { deviceMemory?: number };
  const forced = new URLSearchParams(location.search).get("weak");
  const android = /Android/i.test(navigator.userAgent);
  const weak = forced === "1" ? true : forced === "0" ? false
    : WEAK_GPU.test(gpu) || (android && ((nav.deviceMemory ?? 8) <= 3 || (navigator.hardwareConcurrency ?? 8) <= 4));
  verdict = { weak, gpu };
  return verdict;
}
