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
  title: "Explore Wayanad — drive to Wayanad",
  description: "Drive up the Thamarassery Churam into Wayanad: nine hairpins in monsoon traffic, rain and mist, to the gateway at Lakkidi.",
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
