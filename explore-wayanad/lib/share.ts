/**
 * Sharing a climb and remembering your best. The best time lives on the player's device (localStorage) until there's a
 * shared leaderboard (needs a database). Sharing uses the phone's share sheet where there is one, else WhatsApp.
 */
const BEST = "wayanad-best-climb";

/** 402 s → "6:42". */
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Records a finished climb; returns the best so far and whether this one is it. */
export function recordClimb(sec: number): { best: number; isNew: boolean } {
  let best = Infinity;
  try { best = Number(localStorage.getItem(BEST)) || Infinity; } catch {}
  const isNew = sec < best;
  if (isNew) { best = sec; try { localStorage.setItem(BEST, String(Math.round(sec))); } catch {} }
  return { best, isNew };
}

export async function shareClimb(sec: number) {
  const url = location.origin + "/";
  const text = `I drove up the Thamarassery Churam — nine hairpins to the Lakkidi gate — in ${clock(sec)}. Can you beat it?`;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) { try { await nav.share({ title: "Explore Wayanad", text, url }); return; } catch { /* closed, or not allowed: WhatsApp instead */ } }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
}
