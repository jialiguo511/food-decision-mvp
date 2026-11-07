// /dev/home — development only (404 in production).
//
// The real Home (HomeFlow) with fixture props and stand-ins for the network:
// the sentence reader and /api/recommend answer from a tiny local script, and
// geolocation returns a fixed point. It exists to look at the screens and
// click through the flows (sentence → cards, sentence → clarify → cards, a
// failed read, step by step) at phone width without a login. It proves
// nothing about the real model, the real recommender or auth.

import { notFound } from "next/navigation";
import Harness from "./Harness";

export default function HomeHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Harness />;
}
