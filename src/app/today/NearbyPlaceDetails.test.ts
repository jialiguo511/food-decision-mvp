// The compact nearby-place card body: guidance is labeled as guidance, the
// restaurant's own links appear only when they exist, and an old saved session
// (no website) renders exactly as before.

import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { NearbyRecommendation } from "@/lib/types";
import NearbyPlaceDetails from "./NearbyPlaceDetails";
import PlaceCardActions from "./PlaceCardActions";

const rec = (o: Partial<NearbyRecommendation> = {}): NearbyRecommendation => ({
  decision_mode: "nearby",
  role: "best_match",
  title: "Mediterranean Grill",
  place_id: "a",
  reason: "Close by and filling.",
  look_for: "A grilled chicken and rice bowl, sauce on the side.",
  category: "Mediterranean restaurant",
  address: "123 Main St",
  distance_m: 400,
  open_now: true,
  price_level: "moderate",
  maps_url: "https://www.google.com/maps/search/?api=1&query_place_id=a",
  website_url: "https://med-grill.example/",
  ...o,
});

type Props = { href?: string; children?: ReactNode };
function collect(node: ReactNode, links: string[], text: string[]) {
  if (Array.isArray(node)) return node.forEach((n) => collect(n, links, text));
  if (typeof node === "string") return void text.push(node);
  if (node && typeof node === "object" && "props" in node) {
    const el = node as ReactElement<Props>;
    if (el.type === "a" && el.props.href) links.push(el.props.href);
    collect(el.props.children, links, text);
  }
}
const render = (r: NearbyRecommendation) => {
  const links: string[] = [];
  const text: string[] = [];
  collect(NearbyPlaceDetails({ r, sessionId: "s1", index: 0 }), links, text);
  return { links, text: text.join(" ") };
};

describe("NearbyPlaceDetails", () => {
  it("shows the look-for guidance labeled as guidance, plus the reason", () => {
    const { text } = render(rec());
    expect(text).toContain("What to look for");
    expect(text).toContain("guidance, not a menu item");
    expect(text).toContain("A grilled chicken and rice bowl, sauce on the side.");
    expect(text).toContain("Close by and filling.");
  });

  it("withheld guidance (look_for null) shows no food suggestion but keeps the place and links", () => {
    const { text, links } = render(rec({ look_for: null }));
    expect(text).not.toContain("What to look for");
    expect(text).toContain("No food suggestion for this place.");
    expect(text).toContain("Close by and filling.");
    expect(links).toHaveLength(2);
  });

  it("offers Maps and the restaurant's website when it has one", () => {
    expect(render(rec()).links).toEqual([
      "https://www.google.com/maps/search/?api=1&query_place_id=a",
      "https://med-grill.example/",
    ]);
  });

  it("offers only Maps for a place with no website (limited metadata / old saved session)", () => {
    const { links, text } = render(rec({ website_url: null, category: null, address: null, distance_m: null, price_level: null, open_now: null }));
    expect(links).toEqual(["https://www.google.com/maps/search/?api=1&query_place_id=a"]);
    expect(text).not.toContain("Website");
    expect(text).not.toContain("Open when checked");
  });

  it("puts the 'Not for me' control on every card, keyed by the provider place id", () => {
    const find = (node: ReactNode): ReactElement<{ placeId: string; initialFeedback: unknown }> | null => {
      if (Array.isArray(node)) return node.map(find).find(Boolean) ?? null;
      if (node && typeof node === "object" && "props" in node) {
        const el = node as ReactElement<{ placeId: string; initialFeedback: unknown; children?: ReactNode }>;
        return el.type === PlaceCardActions ? el : find(el.props.children);
      }
      return null;
    };
    expect(find(NearbyPlaceDetails({ r: rec({ place_id: "ChIJ-abc" }), sessionId: "s1", index: 0 }))?.props).toMatchObject({ placeId: "ChIJ-abc", sessionId: "s1", index: 0, initialFeedback: null, initialSaved: false });
    expect(find(NearbyPlaceDetails({ r: rec({ place_id: "ChIJ-abc" }), sessionId: "s1", index: 0, feedback: { action: "exclude" } }))?.props.initialFeedback).toEqual({ action: "exclude" });
  });
});
