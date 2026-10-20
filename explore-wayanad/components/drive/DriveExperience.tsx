"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useCapability } from "@/hooks/useCapability";
import { game, resetBus } from "@/lib/game";
import { setDriveWeather } from "@/lib/weather";
import { scrollState } from "@/lib/scrollState";
import MiniMap from "@/components/ui/MiniMap";
import DriveHud from "./DriveHud";
import styles from "./Drive.module.scss";

const Scene = dynamic(() => import("@/components/scene/Scene"), { ssr: false });

/** /drive: the same world as the story, with you at the wheel of the bus (lib/game, components/drive). */
export default function DriveExperience() {
  const tier = useCapability();
  useEffect(() => {
    Object.assign(game, { active: true, started: false, leg: 0, phase: "drive", odometer: 0, clock: 0 });
    resetBus(3);
    scrollState.act = "churam"; scrollState.progress = 0;
    setDriveWeather();
    document.documentElement.classList.add(styles.locked);
    return () => { game.active = false; document.documentElement.classList.remove(styles.locked); };
  }, []);
  return (
    <div className={styles.page}>
      {/* phones get the light tier; the drive needs the canvas, so the video tier falls back to it too */}
      {tier && <Scene tier={tier === "video" ? "lite" : tier} mode="drive" />}
      <MiniMap />
      <DriveHud />
    </div>
  );
}
