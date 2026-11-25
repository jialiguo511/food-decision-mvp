// Builds the BUNDLED iOS app: a static export of the *.ios.tsx screens (next.config.ts →
// BUILD_TARGET=ios), copied into the Capacitor project, with no hosted URL.
//
//   APP_API_BASE=https://<preview-or-production-origin> \
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY=<public site key> \
//   node scripts/ios-build.mjs
//
// Public values only. NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY come from .env.local (or the env) and
// must be the project APP_API_BASE uses.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";

const base = process.env.APP_API_BASE;
if (!base || !/^https:\/\/[^/]+$/.test(base)) {
  console.error("Set APP_API_BASE to an https origin (no path), e.g. a Vercel Preview.");
  process.exit(1);
}
if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) console.warn("[ios-build] NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set: sign-in will skip the check, and Supabase will refuse it if CAPTCHA is on.");

const version = JSON.parse(readFileSync("ios/app-version.json", "utf8")).version;
const env = { ...process.env, BUILD_TARGET: "ios", NEXT_PUBLIC_BUNDLED_APP: "1", NEXT_PUBLIC_APP_API_BASE: base, NEXT_PUBLIC_APP_VERSION: version };

rmSync("build/ios-next", { recursive: true, force: true });
execFileSync("npx", ["next", "build"], { stdio: "inherit", env });
const exported = existsSync("build/ios-next/index.html") ? "build/ios-next" : "out";
rmSync("mobile/app", { recursive: true, force: true });
cpSync(exported, "mobile/app", { recursive: true });
execFileSync("npx", ["cap", "sync", "ios"], { stdio: "inherit", env: { ...process.env, CAP_WEB_DIR: "mobile/app", CAP_SERVER_URL: "" } });
execFileSync("node", ["scripts/ios-register-plugins.mjs"], { stdio: "inherit" });
console.log(`[ios-build] bundled app ${version} → ${base}`);
