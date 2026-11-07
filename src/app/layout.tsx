import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  // "%s · name" for inner pages (About, Demo, …); the bare name on Home.
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.tagline,
  // Controls the label under the icon when added to the iPhone home screen —
  // independent of the browser-tab <title> above. `capable: true` is what
  // makes the home-screen launch open without Safari's address bar/tab UI.
  appleWebApp: {
    capable: true,
    title: BRAND.short,
    statusBarStyle: "default",
  },
  // This Next.js version only emits the modern standard name
  // (mobile-web-app-capable) for the line above. Apple only recognizes that
  // standard name from iOS 15.4 onward, so the legacy vendor-prefixed tag is
  // added explicitly to also cover older iOS versions.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fdfaf5",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
