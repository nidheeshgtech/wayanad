"use client";
import { SUPPORT_URL, UPI, upiLink } from "@/data/support";
import { platform } from "@/lib/native";
import { useEffect, useState } from "react";
import { mark, markSupport } from "@/lib/stats";
import styles from "./SupportButton.module.scss";

/**
 * "Buy Me a Chaya": a small bevelled key (dark glass, gold edge — a step below the gold Start key) that opens the
 * support page (data/support.ts) in a new tab. A glass of chaya for an icon; its steam rises on hover. Only on the title
 * screen and the end-of-drive cards, never on the road. Enter on it opens the page without starting the drive.
 */
export default function SupportButton({ size = "small", where = "title" }: { size?: "small" | "large"; where?: "title" | "end" }) {
  return (
    <a className={styles.key} data-size={size} href={SUPPORT_URL} target="_blank" rel="noopener noreferrer"
      aria-label="Buy Me a Chaya: support Drive Wayanad (opens in a new tab)"
      onClick={() => markSupport(where)} onKeyDown={(e) => e.stopPropagation()}>
      <ChayaGlass /><span>Buy Me a Chaya</span>
    </a>
  );
}

/** "Pay by UPI": a sheet with the amounts (each opens the player's UPI app with it filled in), the bank's QR on a
 * computer when there is one, and the ID to copy. Not shown in the iPhone app (Apple's rules on payment links). */
export function UpiButton({ size = "small" }: { size?: "small" | "large" }) {
  const [open, setOpen] = useState(false), [copied, setCopied] = useState(false), [show, setShow] = useState(false);
  useEffect(() => setShow(platform() !== "ios"), []); // (after hydration: the server can't tell)
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    addEventListener("keydown", key, true); return () => removeEventListener("keydown", key, true);
  }, [open]);
  if (!show) return null;
  const copy = async () => { try { await navigator.clipboard.writeText(UPI.id); setCopied(true); mark("upi-copy"); setTimeout(() => setCopied(false), 2000); } catch {} };
  return (
    <>
      <button type="button" className={styles.key} data-size={size} onClick={() => { setOpen(true); mark("upi-open"); }} onKeyDown={(e) => e.stopPropagation()}>
        <UpiMark /><span>Pay by UPI</span>
      </button>
      {open && (
        <div className={styles.sheet} role="dialog" aria-modal aria-label="Pay by UPI" onClick={() => setOpen(false)} onKeyDown={(e) => e.stopPropagation()}>
          <div className={styles.card} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close">✕</button>
            <b>Buy us a chaya ☕</b>
            <p>Pick an amount: it opens Google Pay, PhonePe, Paytm or your bank's UPI app. The game stays free; this helps build it.</p>
            <div className={styles.amounts}>
              {UPI.amounts.map((a) => <a key={a} href={upiLink(a)} onClick={() => mark(`upi-${a}`)}>₹{a}</a>)}
            </div>
            {UPI.qr && <img className={styles.qr} src={UPI.qr} alt={`UPI QR code for ${UPI.id}`} width={180} height={180} />}
            {UPI.qr && <small className={styles.desk}>On a computer? Scan this with your phone's UPI app.</small>}
            <div className={styles.id}><span>{UPI.id}</span><button type="button" onClick={copy}>{copied ? "Copied ✓" : "Copy UPI ID"}</button></div>
            <small>Didn't open? Copy the ID and pay it in your UPI app.</small>
          </div>
        </div>
      )}
    </>
  );
}

/** The UPI arrows (two chevrons), in the key's gold. */
function UpiMark() {
  return <svg className={styles.glass} viewBox="0 0 24 24" aria-hidden><path d="M6 4l7 8-7 8z" fill="currentColor" /><path d="M12 4l7 8-7 8z" fill="currentColor" opacity=".55" /></svg>;
}

/** The end-of-drive cards' support note: a line of thanks and the button, under the card's own buttons. */
export function SupportNote() {
  useEffect(() => mark("support-seen-end"), []); // (shown: so a card passed by without a press shows in the counts)
  return (
    <div className={styles.note}>
      <p>Enjoying Drive Wayanad? ☕ Support us with a Chaya and help us bring more cars, locations, and exciting features!</p>
      <div className={styles.pair}><SupportButton size="large" where="end" /><UpiButton size="large" /></div>
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
