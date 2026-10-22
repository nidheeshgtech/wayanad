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

/** Shares a climb: the phone's share sheet where there is one (if it isn't allowed, the message is copied instead — a
 * WhatsApp window opened after waiting on the sheet would be blocked, no longer part of the tap), else WhatsApp, opened
 * straight from the tap. Closing the sheet does nothing more. */
export async function shareClimb(sec: number): Promise<"shared" | "copied" | "whatsapp" | "cancelled"> {
  const url = location.origin + "/";
  const text = `I drove up the Thamarassery Churam — nine hairpins to the Lakkidi gate — in ${clock(sec)}. Can you beat it?`;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (!nav.share) { window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener"); return "whatsapp"; }
  try { await nav.share({ title: "Explore Wayanad", text, url }); return "shared"; }
  catch (e) { if ((e as DOMException).name === "AbortError") return "cancelled"; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); return "copied"; } catch { return "cancelled"; }
}
