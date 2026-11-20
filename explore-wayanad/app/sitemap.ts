import type { MetadataRoute } from "next";
import { SITE } from "@/data/site";

/** /sitemap.xml for search engines: the public pages (the drive, the Wayanad drive page about it, and /privacy for the app stores). The dev pages (/story, /vehicles, /dev) are
 * development only and 404 on the live site. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/wayanad-drive`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/cars`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
