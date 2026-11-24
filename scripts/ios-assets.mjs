// Renders the iOS app icon (1024², no alpha) and launch image (2732², cream with the mark) from the
// same three-dot design as src/lib/appIcon.tsx. Usage: node scripts/ios-assets.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createElement as h } from "react";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";

const TERRACOTTA = "#C8643B";
const CREAM = "#FBF7F0";

async function render(file, size, { bg, mark, markScale }) {
  const tile = Math.round(size * markScale);
  const dot = Math.round(tile * 0.16);
  const gap = Math.round(tile * 0.1);
  const dots = h("div", { style: { display: "flex", gap } }, [0, 1, 2].map((i) => h("div", { key: i, style: { width: dot, height: dot, borderRadius: "50%", background: "#fff" } })));
  const inner = mark
    ? h("div", { style: { width: tile, height: tile, borderRadius: Math.round(tile * 0.225), background: TERRACOTTA, display: "flex", alignItems: "center", justifyContent: "center" } }, dots)
    : dots;
  const res = new ImageResponse(h("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: bg } }, inner), { width: size, height: size });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  // App Store icons must not have an alpha channel: round-trip through JPEG to drop it.
  execFileSync("sips", ["-s", "format", "jpeg", file, "--out", `${file}.jpg`], { stdio: "ignore" });
  execFileSync("sips", ["-s", "format", "png", `${file}.jpg`, "--out", file], { stdio: "ignore" });
  execFileSync("rm", [`${file}.jpg`]);
}

const assets = "ios/App/App/Assets.xcassets";
await render(`${assets}/AppIcon.appiconset/AppIcon-512@2x.png`, 1024, { bg: TERRACOTTA, mark: false, markScale: 1 });
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await render(`${assets}/Splash.imageset/${name}`, 2732, { bg: CREAM, mark: true, markScale: 0.09 });
}
console.log("iOS icon and launch image written.");
