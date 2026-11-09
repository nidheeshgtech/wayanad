import type { MetadataRoute } from "next";

/** Add to Home Screen: the drive opens like an app — full screen, no browser bars — in either orientation. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Drive Wayanad",
    short_name: "Drive Wayanad",
    description: "Drive up the Thamarassery Churam into Wayanad: a free 3D driving game.",
    start_url: "/",
    display: "fullscreen",
    orientation: "any",
    background_color: "#0E1F1A",
    theme_color: "#0E1F1A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
