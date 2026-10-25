import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Garage from "@/components/garage/Garage";

export const metadata: Metadata = {
  title: "Vehicles · Explore Wayanad",
  description: "Every vehicle on the Explore Wayanad road, in 3D: the ones in traffic now and the Kerala vehicles built to replace them.",
  robots: { index: false }, // a working page for the team, not for search
};

/** Development only: its credits name the real vehicles the models are based on (no maker names on the live site). */
export default function VehiclesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Garage />;
}
