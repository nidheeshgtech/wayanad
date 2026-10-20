import type { Metadata } from "next";
import DriveExperience from "@/components/drive/DriveExperience";

export const metadata: Metadata = {
  title: "Drive the churam · Explore Wayanad",
  description: "Drive a Kerala state bus up the Thamarassery Churam: nine hairpins to Lakkidi, on to Kalpetta, and through the forest to the Karnataka border.",
};

export default function DrivePage() {
  return <DriveExperience />;
}
