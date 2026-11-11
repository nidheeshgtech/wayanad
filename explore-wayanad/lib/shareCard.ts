/**
 * The share card: a 1080×1920 picture (a phone story) of your climb — the frame at the Lakkidi arch
 * (components/drive/Snapshot), your name, score, time, coins and badges, and the address — shared through the phone's
 * share sheet as an image, or downloaded where files can't be shared (desktop browsers), with the message copied.
 */
import { clock } from "@/lib/share";
import { BADGES } from "@/lib/badges";
import { roundRect } from "@/lib/canvas";

type Shot = { run: number; blob: Blob | null };
export const shot: Shot = ((globalThis as { __wayanadShot?: Shot }).__wayanadShot ??= { run: -1, blob: null });

export type Climb = { name: string; points: number; sec: number; coins: number; hairpins: number; crashes: number; badges: string[] };
const W = 1080, H = 1920, AMBER = "#D9A441", INK = "#EEF2EE", MUTE = "#B8C7C0", BG = "#0E1F1A";
const fmt = (n: number) => n.toLocaleString("en-IN");

function fonts() {
  const css = getComputedStyle(document.documentElement);
  return { serif: css.getPropertyValue("--font-serif").trim() || "Georgia, serif", sans: css.getPropertyValue("--font-sans").trim() || "Helvetica, Arial, sans-serif" };
}

export async function makeCard(c: Climb): Promise<Blob> {
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const g = canvas.getContext("2d")!, { serif, sans } = fonts();
  await document.fonts?.ready;
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  // the drive, cropped to fill the card
  if (shot.blob) {
    try {
      const img = await createImageBitmap(shot.blob), k = Math.max(W / img.width, H / img.height);
      g.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
    } catch {}
  }
  // shade top and bottom so the words read over any scene
  let grad = g.createLinearGradient(0, 0, 0, 420); grad.addColorStop(0, "rgba(8,20,16,.75)"); grad.addColorStop(1, "rgba(8,20,16,0)");
  g.fillStyle = grad; g.fillRect(0, 0, W, 420);
  grad = g.createLinearGradient(0, H * 0.42, 0, H); grad.addColorStop(0, "rgba(8,20,16,0)"); grad.addColorStop(0.35, "rgba(8,20,16,.82)"); grad.addColorStop(1, "rgba(8,20,16,.96)");
  g.fillStyle = grad; g.fillRect(0, H * 0.42, W, H * 0.58);

  const X = 84;
  g.textBaseline = "alphabetic";
  // top: what this is
  g.fillStyle = AMBER; g.font = `500 30px ${sans}`; g.letterSpacing = "6px";
  g.fillText("DRIVE TO WAYANAD", X, 150);
  g.fillStyle = INK; g.font = `300 52px ${serif}`; g.letterSpacing = "0px";
  g.fillText("Thamarassery Churam · 9 hairpins", X, 222);

  // bottom: the climb
  let y = 1150;
  g.fillStyle = MUTE; g.font = `400 40px ${sans}`;
  g.fillText(c.name ? `${c.name} climbed the churam` : "I climbed the churam", X, y);
  y += 190;
  g.fillStyle = AMBER; g.font = `300 200px ${serif}`;
  g.fillText(fmt(c.points), X - 8, y);
  g.fillStyle = MUTE; g.font = `500 30px ${sans}`; g.letterSpacing = "5px";
  g.fillText("POINTS", X, y + 56); g.letterSpacing = "0px";
  y += 150;
  g.fillStyle = INK; g.font = `400 44px ${sans}`;
  g.fillText(`${clock(c.sec)}  ·  ${c.coins} coins  ·  ${c.hairpins}/9 hairpins`, X, y);
  y += 64;
  g.fillStyle = MUTE; g.font = `400 36px ${sans}`;
  g.fillText(c.crashes === 0 ? "No crashes" : `${c.crashes} ${c.crashes === 1 ? "crash" : "crashes"}`, X, y);
  // badges earned
  const icons = BADGES.filter((b) => c.badges.includes(b.id)).map((b) => b.icon);
  if (icons.length) { y += 92; g.font = `56px ${sans}`; g.fillText(icons.join(" "), X, y); }

  // the invitation
  const by = H - 190, label = "drivewayanad.com";
  g.font = `500 44px ${sans}`;
  const w = g.measureText(label).width + 96;
  g.fillStyle = AMBER; roundRect(g, X, by - 62, w, 92, 46); g.fill();
  g.fillStyle = BG; g.fillText(label, X + 48, by);
  g.fillStyle = INK; g.font = `400 36px ${sans}`;
  g.fillText("Can you beat it? Free, in your browser.", X, by + 96);

  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("no image"))), "image/jpeg", 0.92));
}


/** Share the card: as an image through the share sheet where the browser can share files (phones), else downloaded,
 * with the message copied to paste alongside it. */
export async function shareCard(c: Climb): Promise<"shared" | "downloaded" | "cancelled"> {
  const text = `I climbed the Thamarassery Churam in Drive Wayanad: ${fmt(c.points)} points in ${clock(c.sec)}. Can you beat it?`;
  const url = "https://drivewayanad.com";
  const blob = await makeCard(c), file = new File([blob], "drive-wayanad.jpg", { type: "image/jpeg" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text: `${text} ${url}` }); return "shared"; }
    catch (e) { if ((e as DOMException).name === "AbortError") return "cancelled"; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "drive-wayanad.jpg"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { await navigator.clipboard.writeText(`${text} ${url}`); } catch {}
  return "downloaded";
}
