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
    ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: isPlan ? "bottom bottom" : `+=${Math.round(window.innerHeight * content.length)}`,
      pin: !isPlan && !reduce,
      scrub: 0.6,
      onToggle: (self) => { if (self.isActive) { scrollState.act = content.id; hud.setGrade(PALETTE[content.id].grade); } },
      onUpdate: (self) => {
        const p = self.progress;
        scrollState.act = content.id; scrollState.progress = p;
        if (!reduce) lines.forEach((l, i) => {
          const k = gsap.utils.clamp(0, 1, (p - i * 0.08) * 6);
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
