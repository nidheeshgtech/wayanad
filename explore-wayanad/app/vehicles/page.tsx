import type { Metadata } from "next";
import Garage from "@/components/garage/Garage";

export const metadata: Metadata = {
  title: "Vehicles · Explore Wayanad",
  description: "Every vehicle on the Explore Wayanad road, in 3D: the ones in traffic now and the Kerala vehicles built to replace them.",
  robots: { index: false }, // a working page for the team, not for search
};

export default function VehiclesPage() {
  return <Garage />;
}
