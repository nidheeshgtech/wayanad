import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.scss";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["300", "400"], variable: "--font-serif", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-sans", display: "swap" });

// absolute links for the share preview (app/opengraph-image.png): the production domain Vercel provides at build
const site = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const metadata: Metadata = {
  metadataBase: site ? new URL(`https://${site}`) : undefined,
  title: "Drive Wayanad — Thamarassery Churam 3D driving game",
  // Add to Home Screen on iPhone: opens full screen like an app (no Safari bars), status bar over the dark page
  appleWebApp: { capable: true, title: "Drive Wayanad", statusBarStyle: "black-translucent" },
  description: "A free 3D driving game in your browser: drive up the Thamarassery Churam into Wayanad, nine hairpins in monsoon traffic, rain and mist, to the gateway at Lakkidi. Play alone or with a friend.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0E1F1A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${instrument.variable}`}>
      {/* visitor counts (enable Analytics for the project in Vercel): the numbers sponsors will ask for */}
      <body>{children}<Analytics /></body>
    </html>
  );
}
