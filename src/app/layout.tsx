import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker Agent — Play Smart. Stay Ahead.",
  description:
    "AI-assisted poker player & agent management with an Omaha / Texas Hold'em odds calculator.",
};

export const viewport: Viewport = {
  themeColor: "#0a110d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
