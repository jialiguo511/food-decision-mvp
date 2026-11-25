// Root layout of the BUNDLED iOS build (pageExtensions ios.tsx — see next.config.ts): the web
// layout plus the app root (fetch bridge, update-required check).
import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import NativeBridge from "@/components/NativeBridge";
import AppRoot from "@/ios/AppRoot";
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
  // Without "cover", iOS reports every env(safe-area-inset-*) as 0, so the notch and home
  // indicator areas are never padded (home-screen web app and the iOS app alike).
  viewportFit: "cover",
  themeColor: "#fbf7f0",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <NativeBridge />
        <AppRoot>{children}</AppRoot>
      </body>
    </html>
  );
}
