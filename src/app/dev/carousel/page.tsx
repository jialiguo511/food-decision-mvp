// /dev/carousel — development only (404 in production).
//
// A visual harness for the Home results carousel: the REAL Carousel, RecipeCard
// and RecipeImage, three fixture recipes, and a stand-in for POST /api/image
// that answers with a labelled SVG after a delay and logs every call. It exists
// to check client behaviour (when each card asks for its picture, how often,
// layout at phone and desktop widths). It proves nothing about the real
// generation path — that needs OPENAI_API_KEY / PEXELS_API_KEY and a signed-in
// session.

import { notFound } from "next/navigation";
import Harness from "./Harness";

export default function CarouselHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Harness />;
}
