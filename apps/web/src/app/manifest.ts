import type { MetadataRoute } from "next";

/**
 * Web app manifest — installs / home-screen use the same BellBoy mark as the
 * browser-tab favicon. Next serves this at `/manifest.webmanifest` and injects
 * the `<link rel="manifest">` automatically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BellBoy — Hotel operator fee audit agent",
    short_name: "BellBoy",
    description:
      "Recompute every operator fee from your hotel management agreement and monthly statements, with a cited, dispute-ready memo.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4EFE1",
    theme_color: "#16294C",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192", purpose: "maskable" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
