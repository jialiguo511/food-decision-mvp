// Prepares the iOS project: writes the hosted app's address into the bundled pages and runs
// `cap sync ios`. Usage: CAP_SERVER_URL=http://localhost:3000 node scripts/ios-sync.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const url = process.env.CAP_SERVER_URL;

// Bundled-UI proof of concept: no hosted URL; the screen ships in the app and calls CAP_API_BASE.
if (process.env.CAP_WEB_DIR === "mobile/poc") {
  const need = { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, apiBase: process.env.CAP_API_BASE };
  if (Object.values(need).some((v) => !v)) {
    console.error("POC needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (public values) and CAP_API_BASE.");
    process.exit(1);
  }
  const config = { ...need, turnstileSiteKey: process.env.CAP_TURNSTILE_SITE_KEY ?? "" };
  writeFileSync("mobile/poc/config.js", `window.POC_CONFIG = ${JSON.stringify(config)};\n`);
  copyFileSync("node_modules/@supabase/supabase-js/dist/umd/supabase.js", "mobile/poc/supabase.js");
  execFileSync("npx", ["cap", "sync", "ios"], { stdio: "inherit", env: process.env });
  registerLocalPlugins();
  process.exit(0);
}

// A path is allowed for Simulator testing (http://localhost:3000/dev/home opens the fixture Home).
// Don't use Capacitor's appStartPath for that: it only accepts files bundled in the app and stops
// the app at launch otherwise.
if (!url || !/^https:\/\/|^http:\/\/localhost(:\d+)?(\/|$)/.test(url)) {
  console.error("Set CAP_SERVER_URL to an https URL, or http://localhost:<port> for the Simulator.");
  process.exit(1);
}
writeFileSync("mobile/www/app-url.js", `window.APP_URL = ${JSON.stringify(url)};\n`);
execFileSync("npx", ["cap", "sync", "ios"], { stdio: "inherit", env: process.env });

// Plugins that live in this project (not npm) must be in packageClassList, which Capacitor reads
// when the bridge starts. Registering them later (capacitorDidLoad) is too late for a hosted page:
// the page never learns they exist and calls fail with UNIMPLEMENTED.
registerLocalPlugins();

function registerLocalPlugins() {
  const LOCAL_PLUGINS = ["AppleSignInPlugin", "WebAuthPlugin", "KeychainPlugin"];
  const generated = "ios/App/App/capacitor.config.json";
  const config = JSON.parse(readFileSync(generated, "utf8"));
  config.packageClassList = [...new Set([...(config.packageClassList ?? []), ...LOCAL_PLUGINS])];
  writeFileSync(generated, JSON.stringify(config, null, "\t") + "\n");
  console.log(`[ios-sync] local plugins registered: ${LOCAL_PLUGINS.join(", ")}`);
}
