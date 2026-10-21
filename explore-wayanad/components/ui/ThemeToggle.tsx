"use client";
import { useEffect, useState } from "react";
import { setTheme, theme, THEMES, type ThemeName } from "@/lib/theme";
import styles from "./Hud.module.scss";

const LABEL: Record<ThemeName, string> = { day: "Day", dusk: "Evening", night: "Night" };
const ICON: Record<ThemeName, React.ReactNode> = {
  day: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  dusk: <><path d="M6 16a6 6 0 0 1 12 0" /><path d="M2.5 16h19M5 19.5h14M12 4.5v3M4.6 8.6l1.8 1.8M19.4 8.6l-1.8 1.8" /></>,
  night: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
};

/**
 * Time of day (lib/theme): shows the current one; each press moves on, day → evening → night → day, and the scene fades
 * between them. On the story page it sits above the sound button; drive mode passes its own row's `className`.
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const [name, setName] = useState<ThemeName>("day");
  useEffect(() => setName(theme.name), []); // after hydration: the server always renders "day"
  const next = THEMES[(THEMES.indexOf(name) + 1) % THEMES.length], label = `${LABEL[name]} · switch to ${LABEL[next].toLowerCase()}`;
  return (
    <button type="button" className={className ?? styles.theme} aria-label={label} title={label} data-theme={name}
      onClick={() => { setTheme(next); setName(next); }}>
      <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{ICON[name]}</svg>
    </button>
  );
}
