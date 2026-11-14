import type { Metadata } from "next";
import ConfirmClient from "./ConfirmClient";

// A page that is reached with a secret in its address: never indexed, never sends a Referer.
// (The same two protections are also sent as response headers — see next.config.ts.)
export const metadata: Metadata = {
  title: "Confirm sign-in",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConfirmPage() {
  return <ConfirmClient />;
}
