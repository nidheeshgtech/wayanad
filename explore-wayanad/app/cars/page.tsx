import type { Metadata } from "next";
import Collection from "@/components/collection/Collection";

export const metadata: Metadata = {
  title: "Vehicle collection · Drive Wayanad",
  description: "Every vehicle on the Thamarassery Churam in Drive Wayanad: cars, bikes, the auto, KSRTC buses, the police jeep and more. See each one in 3D, compare their speed and handling, and drive them in the game.",
  alternates: { canonical: "/cars" },
};

export default function CarsPage() {
  return <Collection />;
}
