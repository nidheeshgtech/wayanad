import type { Metadata } from "next";
import Showroom from "@/components/collection/Showroom";

// a preview for choosing the next vehicles: not for search
export const metadata: Metadata = {
  title: "New garage (preview) · Drive Wayanad",
  robots: { index: false, follow: false },
};

export default function NewGaragePage() {
  return <Showroom />;
}
