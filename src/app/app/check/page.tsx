// /app/check — the hosted half of the sign-in check bridge (lib/appCheck.ts). Opened only by the iOS
// app in Apple's authentication sheet. No sign-in happens here and nothing is stored.
import type { Metadata } from "next";
import CheckClient from "./CheckClient";

export const metadata: Metadata = { title: "Quick check", robots: { index: false, follow: false } };

export default function AppCheckPage() {
  return <CheckClient />;
}
