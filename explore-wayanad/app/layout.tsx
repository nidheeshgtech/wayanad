import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.scss";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["300", "400"], variable: "--font-serif", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Explore Wayanad — nine bends to the top",
  description: "Drive the Thamarassery Churam into Wayanad: nine hairpins, the gateway at Lakkidi, then across the plateau to the Karnataka border. Real timings, real closures.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0E1F1A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${instrument.variable}`}>
      <body>{children}</body>
    </html>
  );
}
