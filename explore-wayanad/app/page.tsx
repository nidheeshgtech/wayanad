import type { Metadata } from "next";
import DriveExperience from "@/components/drive/DriveExperience";
import { SITE } from "@/data/site";

export const metadata: Metadata = {
  title: "Drive Wayanad — Thamarassery Churam 3D driving game",
  description: "A free 3D driving game in your browser: drive up the Thamarassery Churam into Wayanad, nine hairpins in monsoon traffic, rain and mist, to the gateway at Lakkidi. Play alone or with a friend.",
  alternates: { canonical: `${SITE}/` },
  openGraph: { title: "Drive the Thamarassery Churam", description: "Nine hairpins in monsoon traffic, rain and mist, up to the Lakkidi gate. Play it in your browser.", type: "website", siteName: "Drive Wayanad" },
  twitter: { card: "summary_large_image", title: "Drive the Thamarassery Churam", description: "Nine hairpins in monsoon traffic, rain and mist, up to the Lakkidi gate." },
};

/** The site opens on the drive (owner's call, 2026-10-22). The scroll story lives on /story in development only. */
export default function Page() {
  return <DriveExperience />;
}
