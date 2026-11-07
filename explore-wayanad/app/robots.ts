import type { MetadataRoute } from "next";
import { SITE } from "@/data/site";

/** /robots.txt: everything open except the development pages; where the sitemap is. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/dev/", "/story", "/vehicles"] }], sitemap: `${SITE}/sitemap.xml`, host: SITE };
}
