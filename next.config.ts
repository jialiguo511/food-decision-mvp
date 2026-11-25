import path from "node:path";
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
  // The iOS app's Universal Links file (src/app/api/aasa/route.ts).
  async rewrites() {
    return [{ source: "/.well-known/apple-app-site-association", destination: "/api/aasa" }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The sign-in confirmation page is reached with a one-time secret in its address. Later entries
      // win for a repeated key, so its Referrer-Policy is the strictest: no Referer at all. Nothing
      // under /auth/ is stored by a browser, proxy or CDN, or indexed.
      {
        source: "/auth/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

// ---------------------------------------------------------------------------------------------
// The bundled iOS build (scripts/ios-build.mjs sets BUILD_TARGET=ios). A static export of the
// `*.ios.tsx` screens only — no API routes, middleware or Server Actions in it; those stay on the
// server the app calls. Client modules keep their imports; these files are swapped at build time
// for app versions with the same exports.
// ---------------------------------------------------------------------------------------------
const IOS_SWAPS: [RegExp, string][] = [
  [/[\\/]src[\\/]app[\\/]today[\\/]actions\.ts$/, "src/ios/shims/today.actions.ts"],
  [/[\\/]src[\\/]app[\\/]today[\\/]events\.actions\.ts$/, "src/ios/shims/events.actions.ts"],
  [/[\\/]src[\\/]app[\\/]saved[\\/]actions\.ts$/, "src/ios/shims/saved.actions.ts"],
  [/[\\/]src[\\/]app[\\/]profile[\\/]actions\.ts$/, "src/ios/shims/profile.actions.ts"],
  [/[\\/]src[\\/]app[\\/]profile[\\/]account\.actions\.ts$/, "src/ios/shims/account.actions.ts"],
  [/[\\/]src[\\/]app[\\/]feedback[\\/]actions\.ts$/, "src/ios/shims/feedback.actions.ts"],
  [/[\\/]src[\\/]lib[\\/]supabase[\\/]client\.ts$/, "src/ios/supabaseClient.ts"],
  [/[\\/]src[\\/]components[\\/]Turnstile\.tsx$/, "src/ios/Turnstile.tsx"],
];

const iosConfig: NextConfig = {
  output: "export",
  distDir: "build/ios-next",
  pageExtensions: ["ios.tsx", "ios.ts"],
  poweredByHeader: false,
  webpack(config, { webpack }) {
    for (const [pattern, target] of IOS_SWAPS) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(pattern, (resource: { request: string; createData?: { resource?: string } }) => {
          const absolute = path.resolve(process.cwd(), target);
          if (resource.createData?.resource) resource.createData.resource = absolute;
          else resource.request = absolute;
        }),
      );
    }
    return config;
  },
};

export default process.env.BUILD_TARGET === "ios" ? iosConfig : nextConfig;
