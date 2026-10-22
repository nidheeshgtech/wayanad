import { notFound } from "next/navigation";
import Experience from "@/components/Experience";

/** The scroll story (Acts 1–11): development only for now; the live site is the drive (app/page.tsx). */
export default function StoryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Experience />;
}
