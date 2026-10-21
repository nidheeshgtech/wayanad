"use client";
import dynamic from "next/dynamic";
import { useCapability } from "@/hooks/useCapability";
import { ACTS } from "@/data/acts";
import Hud from "./ui/Hud";
import Preroll from "./ui/Preroll";
import SmoothScroll from "./ui/SmoothScroll";
import MiniMap from "./ui/MiniMap";
import Churam from "./acts/Churam";
import Simple from "./acts/Simple";
import ForestRoad from "./acts/ForestRoad";
import Border from "./acts/Border";
import Plateau from "./acts/Plateau";
import styles from "./acts/Act.module.scss";

const Scene = dynamic(() => import("./scene/Scene"), { ssr: false });

/**
 * The one-pager. DOM acts are server-renderable content; the canvas is a visual layer
 * chosen by capability. "video" tier (Phase 3) swaps the canvas for scroll-scrubbed footage.
 */
export default function Experience() {
  const tier = useCapability();
  return (
    <Hud>
      <Preroll scene={tier === null ? null : tier !== "video"} />
      <SmoothScroll />
      <MiniMap />
      {tier && tier !== "video" && <Scene tier={tier} />}
      {tier === "video" && <div style={{ position: "fixed", inset: 0, background: "linear-gradient(#9fb3aa, #1f3a31)" }} aria-hidden />}
      <main>
        <Churam />
        {ACTS.slice(1).map((a) =>
          a.id === "forest" ? <ForestRoad key={a.id} content={a} /> :
          a.id === "kalpetta" ? <Plateau key={a.id} content={a}><CompassCards /></Plateau> :
          a.id === "border" ? <Border key={a.id} content={a} /> : (
            <Simple key={a.id} content={a}>
              {a.id === "stay" && <StayCards />}
              {a.id === "plan" && <PlanRows />}
            </Simple>
          ))}
      </main>
    </Hud>
  );
}

/** The hub's three roads, from the prototype. They animate out along their compass directions in Phase 3. */
function CompassCards() {
  return (
    <div className={styles.cards} data-line>
      <div><b>South</b>tea, peaks, falls</div>
      <div><b>East</b>caves, Bathery, forest</div>
      <div><b>North</b>dam, island, temples</div>
    </div>
  );
}

/** Placeholder stays from the prototype; Supabase cards replace these in Phase 4. */
function StayCards() {
  return (
    <div className={styles.stays} data-line>
      <div>Treehouse · Vythiri</div><div>Planter&apos;s bungalow · Meppadi</div><div>Homestay · Pulpally</div><div>Resort · Sulthan Bathery</div>
    </div>
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
