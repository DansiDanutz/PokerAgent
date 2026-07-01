import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Poker Agent — Play Smart. Stay Ahead.",
    short_name: "Poker Agent",
    description:
      "AI-assisted poker player & agent management with an Omaha / Texas Hold'em odds calculator.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a110d",
    theme_color: "#0a110d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
