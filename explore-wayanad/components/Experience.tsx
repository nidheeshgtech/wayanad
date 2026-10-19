"use client";
import dynamic from "next/dynamic";
import { useCapability } from "@/hooks/useCapability";
import { ACTS } from "@/data/acts";
import Hud from "./ui/Hud";
import Preroll from "./ui/Preroll";
import SmoothScroll from "./ui/SmoothScroll";
import Churam from "./acts/Churam";
import Simple from "./acts/Simple";

const Scene = dynamic(() => import("./scene/Scene"), { ssr: false });

/**
 * The one-pager. DOM acts are server-renderable content; the canvas is a visual layer
 * chosen by capability. "video" tier (Phase 3) swaps the canvas for scroll-scrubbed footage.
 */
export default function Experience() {
  const tier = useCapability();
  return (
    <Hud>
      <Preroll />
      <SmoothScroll />
      {tier && tier !== "video" && <Scene tier={tier} />}
      {tier === "video" && <div style={{ position: "fixed", inset: 0, background: "linear-gradient(#9fb3aa, #1f3a31)" }} aria-hidden />}
      <main>
        <Churam />
        {ACTS.slice(1).map((a) => (
          <Simple key={a.id} content={a}>
            {a.id === "plan" && <PlanRows />}
          </Simple>
        ))}
      </main>
    </Hud>
  );
}

function PlanRows() {
  const rows: [string, string][] = [
    ["Nearest airport", "Kozhikode (CCJ) · about 3 h to Kalpetta via the churam"],
    ["Best months", "October to February"],
    ["Monsoon", "June to September · mist, full falls, Kuruva closed"],
    ["Itineraries", "3 · 5 · 7 days"],
  ];
  return (
    <div style={{ display: "grid", gap: 0 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ borderTop: "1px solid var(--line)", padding: "12px 0", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{k}</span><span style={{ color: "var(--mute)", textAlign: "right" }}>{v}</span>
        </div>
      ))}
      <a href="#" style={{ display: "inline-flex", alignItems: "center", minHeight: 48, padding: "0 24px", borderRadius: 999, background: "var(--amber)", color: "#0e1f1a", textDecoration: "none", fontWeight: 500, width: "max-content", marginTop: 16 }}>Ask on WhatsApp</a>
    </div>
  );
}
