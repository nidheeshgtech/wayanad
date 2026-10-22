import type { Metadata } from "next";
import DriveExperience from "@/components/drive/DriveExperience";

export const metadata: Metadata = {
  title: "Explore Wayanad — drive the churam",
  description: "Drive up the Thamarassery Churam into Wayanad: nine hairpins in monsoon traffic, rain and mist, to the gateway at Lakkidi.",
};

/** The site opens on the drive (owner's call, 2026-10-22). The scroll story lives on /story in development only. */
export default function Page() {
  return <DriveExperience />;
}
