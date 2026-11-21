"use client";
import { SUPPORT_URL } from "@/data/support";
import { useEffect, useState } from "react";
import { platform } from "@/lib/native";
import { mark, markSupport } from "@/lib/stats";
import styles from "./SupportButton.module.scss";

/**
 * "Buy Me a Chaya": a small bevelled key (dark glass, gold edge — a step below the gold Start key) that opens the
 * support page (data/support.ts) in a new tab. A glass of chaya for an icon; its steam rises on hover. Only on the title
 * screen and the end-of-drive cards, never on the road. Enter on it opens the page without starting the drive.
 * Not in the iPhone app: Apple doesn't allow a link out to pay inside an app (App Review 3.1.1); the website and the
 * Android app keep it.
 */
const useOutsideIosApp = () => { const [ok, setOk] = useState(false); useEffect(() => setOk(platform() !== "ios"), []); return ok; }; // (after hydration: the server can't tell)

export default function SupportButton({ size = "small", where = "title" }: { size?: "small" | "large"; where?: "title" | "end" }) {
  if (!useOutsideIosApp()) return null;
  return (
    <a className={styles.key} data-size={size} href={SUPPORT_URL} target="_blank" rel="noopener noreferrer"
      aria-label="Buy Me a Chaya: support Drive Wayanad (opens in a new tab)"
      onClick={() => markSupport(where)} onKeyDown={(e) => e.stopPropagation()}>
      <ChayaGlass /><span>Buy Me a Chaya</span>
    </a>
  );
}

/** The end-of-drive cards' support note: a line of thanks and the button, under the card's own buttons. */
export function SupportNote() {
  const show = useOutsideIosApp();
  useEffect(() => { if (show) mark("support-seen-end"); }, [show]); // (shown: so a card passed by without a press shows in the counts)
  if (!show) return null;
  return (
    <div className={styles.note}>
      <p>Enjoying Drive Wayanad? ☕ Support us with a Chaya and help us bring more cars, locations, and exciting features!</p>
      <SupportButton size="large" where="end" />
    </div>
  );
}

/** A glass of chaya (milky tea, a froth line), with steam. */
function ChayaGlass() {
  return (
    <svg className={styles.glass} viewBox="0 0 24 24" aria-hidden>
      <g className={styles.steam} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M9 6.5c-1.4-1.4 1.4-2.4 0-4" /><path d="M13 6.5c-1.4-1.4 1.4-2.4 0-4" />
      </g>
      <path d="M5.5 8.5h11l-1.3 13H6.8z" fill="rgba(255,236,190,.16)" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.6 12h8.8l-.95 8.6H7.55z" fill="#c98a3c" />
      <path d="M6.6 12h8.8l-.2 1.7H6.8z" fill="#f3dcb4" />
      <path d="M16.6 11.2h1.6a2 2 0 0 1 0 4h-2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
export { styles as supportStyles };
