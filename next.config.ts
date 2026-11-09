import type { NextConfig } from "next";

// Response headers for every route. Deliberately conservative: each one here was
// chosen because it cannot break a page the app renders today.
//
// Not included, on purpose: a script-src Content-Security-Policy. Next.js inlines
// scripts, so a useful one needs per-request nonces — and it could not be checked
// against signed-in pages from a build without a real session. The directives below
// are the CSP parts that are safe without that (see RELEASE.md → "Known limits").
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Our pages never belong inside someone else's frame (clickjacking). Both forms, for old and new browsers.
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  // Don't hand full URLs (they can carry a session id on /today) to other sites.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Location is used once, for the "near me" search, from our own pages; nothing else is.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  // The framework name in a header helps nobody.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
