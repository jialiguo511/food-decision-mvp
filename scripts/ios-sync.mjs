// Prepares the iOS project: writes the hosted app's address into the bundled pages and runs
// `cap sync ios`. Usage: CAP_SERVER_URL=http://localhost:3000 node scripts/ios-sync.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const url = process.env.CAP_SERVER_URL;
if (!url || !/^https:\/\/|^http:\/\/localhost(:\d+)?$/.test(url)) {
  console.error("Set CAP_SERVER_URL to an https origin, or http://localhost:<port> for the Simulator.");
  process.exit(1);
}
writeFileSync("mobile/www/app-url.js", `window.APP_URL = ${JSON.stringify(url)};\n`);
execFileSync("npx", ["cap", "sync", "ios"], { stdio: "inherit", env: process.env });
