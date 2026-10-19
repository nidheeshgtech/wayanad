"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useCapability } from "@/hooks/useCapability";
import PHOTOS from "@/data/photos.json";
import { ACTS } from "@/data/acts";
import Hud from "./ui/Hud";
import Preroll from "./ui/Preroll";
import SmoothScroll from "./ui/SmoothScroll";
import Churam from "./acts/Churam";
import Simple from "./acts/Simple";
import ForestRoad from "./acts/ForestRoad";
import Border from "./acts/Border";
import PhotoStage from "./photo/PhotoStage";
import styles from "./acts/Act.module.scss";

const Scene = dynamic(() => import("./scene/Scene"), { ssr: false });

/**
 * The one-pager. DOM acts are server-renderable content; behind them, one visual layer:
 * real photographs of each place (the default until drone footage exists), or the 3D scene with `?view=3d`.
 */
export default function Experience() {
  const [view, setView] = useState<"photo" | "3d">("photo");
  useEffect(() => { if (new URLSearchParams(location.search).get("view") === "3d") setView("3d"); }, []);
  return (
    <Hud>
      <Preroll />
      <SmoothScroll />
      {view === "photo" ? <PhotoStage /> : <Scene3D />}
      <main>
        <Churam />
        {ACTS.slice(1).map((a) =>
          a.id === "forest" ? <ForestRoad key={a.id} content={a} /> :
          a.id === "border" ? <Border key={a.id} content={a} /> : (
            <Simple key={a.id} content={a}>
              {a.id === "kalpetta" && <CompassCards />}
              {a.id === "stay" && <StayCards />}
              {a.id === "plan" && <PlanRows />}
            </Simple>
          ))}
      </main>
    </Hud>
  );
}

/** The 3D churam, by device tier; weak devices get the photo stage instead. */
function Scene3D() {
  const tier = useCapability();
  if (!tier) return null;
  return tier === "video" ? <PhotoStage /> : <Scene tier={tier} />;
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
      <Credits />
    </div>
  );
}

/** Every photo on the page with its author and licence (CC BY / BY-SA require it), plus the map data. */
function Credits() {
  return (
    <details style={{ marginTop: 32, fontSize: 12, color: "var(--dim)" }}>
      <summary style={{ cursor: "pointer", minHeight: 32 }}>Photo and map credits</summary>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4, marginTop: 8 }}>
        {PHOTOS.map((p) => (
          <li key={p.id}>
            {p.place}: <a href={p.source} target="_blank" rel="noopener noreferrer">{p.author}</a>,{" "}
            {p.licenseUrl ? <a href={p.licenseUrl} target="_blank" rel="noopener noreferrer">{p.license}</a> : p.license}, via Wikimedia Commons
          </li>
        ))}
        <li>Road and hairpins: © OpenStreetMap contributors, ODbL</li>
      </ul>
    </details>
  );
}
