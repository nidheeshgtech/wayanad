"use client";
import { useCallback, useState } from "react";
import StartScreen, { panelStyles } from "./StartScreen";

/**
 * The story's title screen (components/ui/StartScreen): it holds until the scene is fully built and warmed, so the
 * climb starts smoothly, then fades out on Start. `scene`: whether a canvas is coming (null while the capability
 * probe runs; false for the video tier, which needs no wait).
 */
export default function Preroll({ scene }: { scene: boolean | null }) {
  const [state, setState] = useState<"idle" | "go" | "done">("idle");
  const start = useCallback(() => {
    setState("go");
    setTimeout(() => setState("done"), matchMedia("(prefers-reduced-motion: reduce)").matches ? 50 : 900);
  }, []);
  if (state === "done") return null;
  return (
    <StartScreen
      eyebrow="Act 1 · Thamarassery Churam"
      title={<>Nine bends<br />to the top.</>}
      lead="Fourteen kilometres from Adivaram up to the Lakkidi gate. Scroll to ride it. Sound stays off until you turn it on."
      stats={[["Adivaram", "Start"], ["14 km", "Distance"], ["9", "Hairpins"]]}
      startLabel="Start the climb" onStart={start} scene={scene} leaving={state === "go"}
      footer={<a className={panelStyles.link} href="/drive">Or drive it yourself →</a>}
    />
  );
}
