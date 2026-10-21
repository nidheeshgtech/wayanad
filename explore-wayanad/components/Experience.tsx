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
import PlanTrip from "./acts/PlanTrip";
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
              {a.id === "plan" && <PlanTrip />}
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
