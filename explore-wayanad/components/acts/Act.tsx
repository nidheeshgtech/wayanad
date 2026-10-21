"use client";
import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { PALETTE, type ActContent } from "@/data/acts";
import { scrollState } from "@/lib/scrollState";
import { useHud } from "@/components/ui/Hud";
import styles from "./Act.module.scss";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * One pinned act. Writes act + progress into scrollState; the Director reads it.
 * `onProgress` lets an act drive its own DOM (counter, route line, hold badge).
 */
export default function Act({ content, children, onProgress }: {
  content: ActContent;
  children?: React.ReactNode;
  onProgress?: (p: number) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const hud = useHud();

  useGSAP(() => {
    const el = ref.current!;
    const lines = el.querySelectorAll<HTMLElement>("[data-line]");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isPlan = content.id === "plan";
    if (isPlan) lines.forEach((l) => { l.style.opacity = "1"; l.style.transform = "none"; }); // long and static: shown as it is
    ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: isPlan ? "bottom bottom" : `+=${Math.round(window.innerHeight * content.length)}`,
      pin: !isPlan && !reduce,
      scrub: content.scrub ?? 0.6,
      // the plan is a plain page: the HUD steps aside while it's on screen (app/globals.scss)
      onToggle: (self) => { if (isPlan) document.documentElement.toggleAttribute("data-plan", self.isActive); if (self.isActive) { scrollState.act = content.id; hud.setGrade(PALETTE[content.id].grade); hud.showCounter(content.id === "churam" || content.id === "border"); } },
      onUpdate: (self) => {
        const p = self.progress;
        scrollState.act = content.id; scrollState.progress = p;
        if (!reduce && !isPlan) lines.forEach((l, i) => {
          const from = content.reveal ?? 0, k = gsap.utils.clamp(0, 1, ((p - from) / (1 - from) - i * 0.08) * 6);
          l.style.opacity = String(k); l.style.transform = `translateY(${(1 - k) * 14}px)`;
        });
        onProgress?.(p);
      },
    });
  }, { scope: ref, dependencies: [content.id] });

  return (
    <section ref={ref} className={`${styles.act} ${content.id === "plan" ? styles.plan : ""}`} data-act={content.id}>
      <div className={styles.copy}>
        <div className={styles.eyebrow} data-line>{content.eyebrow}</div>
        <h2 className={styles.title} data-line>{content.title}</h2>
        {content.body && <p className={styles.body} data-line>{content.body}</p>}
        {children}
      </div>
    </section>
  );
}
