import type { Metadata } from "next";
import DriveExperience from "@/components/drive/DriveExperience";
import { SITE } from "@/data/site";

export const metadata: Metadata = {
  title: "Drive Wayanad — free 3D Wayanad drive game, Thamarassery Churam",
  description: "A virtual Wayanad drive: a free 3D driving game in your browser. Climb the nine hairpins of the Thamarassery Churam in monsoon traffic, rain and mist, through the Lakkidi gate to Vythiri and Kalpetta. Play alone or with friends.",
  alternates: { canonical: `${SITE}/` },
  openGraph: { title: "Drive the Thamarassery Churam", description: "Nine hairpins in monsoon traffic, rain and mist, up to the Lakkidi gate. Play it in your browser.", type: "website", siteName: "Drive Wayanad" },
  twitter: { card: "summary_large_image", title: "Drive the Thamarassery Churam", description: "Nine hairpins in monsoon traffic, rain and mist, up to the Lakkidi gate." },
};

/* What the page is, for search engines (schema.org): a free browser game. */
const GAME = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: "Drive Wayanad",
  url: `${SITE}/`,
  description: "A free 3D driving game in the browser: a Wayanad drive up the nine hairpins of the Thamarassery Churam in Kerala, through the Lakkidi gate to Vythiri and Kalpetta.",
  genre: ["Driving", "Simulation"],
  gamePlatform: ["Web browser"],
  applicationCategory: "GameApplication",
  operatingSystem: "Any",
  playMode: ["SinglePlayer", "MultiPlayer"],
  inLanguage: "en",
  image: `${SITE}/opengraph-image.jpg`,
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
  sameAs: ["https://www.instagram.com/drivewayanad.official/"],
};

/** The site opens on the drive (owner's call, 2026-10-22). The scroll story lives on /story in development only. */
export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(GAME) }} />
      <DriveExperience />
    </>
  );
}
