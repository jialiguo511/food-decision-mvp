import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Served automatically at /manifest.webmanifest and linked in <head> — no
// manual <link rel="manifest"> needed, Next.js does that for any app/manifest.ts.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.short,
    description: BRAND.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#fdfaf5",
    theme_color: "#fdfaf5",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
