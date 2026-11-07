"use client";

import type { NearbyRecommendation } from "@/lib/types";
import NearbyPlaceDetails from "../NearbyPlaceDetails";
import type { PlaceFeedbackState } from "../PlaceFeedback";
import type { Selection } from "../useRecommend";
import PlacePhoto from "./PlacePhoto";
import ResultCard from "./ResultCard";

/** A real nearby place. Everything but the model's reason and look-for comes
 *  from the provider, server-side — see NearbyPlaceDetails for what's shown. */
export default function PlaceCard({
  r,
  index,
  sessionId,
  saved,
  feedback,
  selection,
  onChoose,
}: {
  r: NearbyRecommendation;
  index: 0 | 1 | 2;
  sessionId: string;
  saved: boolean;
  feedback: PlaceFeedbackState | null;
  selection: Selection;
  onChoose: (index: 0 | 1 | 2) => void;
}) {
  const chosen = selection.status === "chosen" && selection.index === index;
  return (
    <ResultCard recommendation={r} index={index} selection={selection} onChoose={onChoose} eyebrow={r.category}
      media={<PlacePhoto key={`${sessionId}:${index}`} sessionId={sessionId} index={index} hasPhoto={!!r.photo_name} author={r.photo_author ?? null} />}
    >
      <NearbyPlaceDetails r={r} sessionId={sessionId} index={index} feedback={feedback} saved={saved} chosen={chosen} />
    </ResultCard>
  );
}
