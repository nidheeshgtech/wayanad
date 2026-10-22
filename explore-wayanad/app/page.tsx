import type { Metadata } from "next";
import DriveExperience from "@/components/drive/DriveExperience";

export const metadata: Metadata = {
  title: "Explore Wayanad — drive the churam",
  description: "Drive up the Thamarassery Churam into Wayanad: nine hairpins in monsoon traffic, rain and mist, to the gateway at Lakkidi.",
  openGraph: { title: "Drive the Thamarassery Churam", description: "Nine hairpins in monsoon traffic, rain and mist, up to the Lakkidi gate. Play it in your browser.", type: "website", siteName: "Explore Wayanad" },
  twitter: { card: "summary_large_image", title: "Drive the Thamarassery Churam", description: "Nine hairpins in monsoon traffic, rain and mist, up to the Lakkidi gate." },
};

/** The site opens on the drive (owner's call, 2026-10-22). The scroll story lives on /story in development only. */
export default function Page() {
  return <DriveExperience />;
}
