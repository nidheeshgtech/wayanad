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
  title: "Drive Wayanad — free 3D Wayanad drive game, Thamarassery Churam",
  // Add to Home Screen on iPhone: opens full screen like an app (no Safari bars), status bar over the dark page
  appleWebApp: { capable: true, title: "Drive Wayanad", statusBarStyle: "black-translucent" },
  description: "A free 3D driving game in your browser: drive up the Thamarassery Churam into Wayanad, nine hairpins in monsoon traffic, rain and mist, to the gateway at Lakkidi. Play alone or with a friend.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0E1F1A" };

/** Inside the phone apps (the iPhone app says so in its user agent; the Android app opens the site with an
 * android-app:// referrer, remembered for the tab): <html data-app="ios|android">, set before the first paint, so app-only
 * styling (no site bar on the loading screen) never flashes. Same signals as lib/native platform(). */
const APP_MARK = `try{var a=/DriveWayanadApp/.test(navigator.userAgent)?"ios":(document.referrer.indexOf("android-app://com.drivewayanad.app")===0||sessionStorage.getItem("wayanad-app")==="android")?"android":"";if(a){document.documentElement.setAttribute("data-app",a);if(a==="android")sessionStorage.setItem("wayanad-app","android")}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${instrument.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: APP_MARK }} /></head>
      {/* visitor counts (enable Analytics for the project in Vercel): the numbers sponsors will ask for */}
      <body>{children}<Analytics /></body>
    </html>
  );
}
