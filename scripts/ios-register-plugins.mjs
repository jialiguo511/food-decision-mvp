// Adds this project's own native plugins to the generated Capacitor config (see ios-sync.mjs).
import { readFileSync, writeFileSync } from "node:fs";

const LOCAL_PLUGINS = ["AppleSignInPlugin", "WebAuthPlugin", "KeychainPlugin"];
const generated = "ios/App/App/capacitor.config.json";
const config = JSON.parse(readFileSync(generated, "utf8"));
config.packageClassList = [...new Set([...(config.packageClassList ?? []), ...LOCAL_PLUGINS])];
writeFileSync(generated, JSON.stringify(config, null, "\t") + "\n");
console.log(`[ios] local plugins registered: ${LOCAL_PLUGINS.join(", ")}`);
