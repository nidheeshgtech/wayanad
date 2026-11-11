"use client";
import { useEffect } from "react";

/** When the page throws (an old browser missing a feature, the phone's graphics giving up), show this instead of
 * Next's bare "Application error" line, with a way back in. Matters most in the Android app, which has no reload button. */
export default function ErrorPage({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#0E1F1A", color: "#EEF2EE", padding: "24px", textAlign: "center" }}>
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontFamily: "var(--font-serif), Georgia, serif", fontWeight: 300, fontSize: "clamp(32px, 8vw, 48px)", lineHeight: 1.1, margin: "0 0 16px" }}>The drive stopped.</h1>
        <p style={{ fontFamily: "var(--font-sans), system-ui, sans-serif", color: "#B8C7C0", fontSize: 16, lineHeight: 1.5, margin: "0 0 28px" }}>
          Something on this phone or browser didn&apos;t load. Reload to try again. If it keeps happening, update Chrome from the Play Store.
        </p>
        <button
          onClick={() => location.reload()}
          style={{ fontFamily: "var(--font-sans), system-ui, sans-serif", fontWeight: 500, fontSize: 16, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0E1F1A", background: "#D9A441", border: 0, borderRadius: 999, padding: "16px 40px", cursor: "pointer" }}
        >
          Reload
        </button>
      </div>
    </main>
  );
}
