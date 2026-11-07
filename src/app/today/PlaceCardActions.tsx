"use client";

import { useState } from "react";
import PlaceFeedback, { type PlaceFeedbackState } from "./PlaceFeedback";
import { SaveButton } from "./SaveControl";

/** The two quiet actions under a place card — Save, and "Not for me" — sharing
 *  state so a hard "not for me" also clears the Save on the same card (the
 *  server removes it from Saved at the same moment). */
export default function PlaceCardActions({
  placeId,
  sessionId,
  index,
  initialFeedback,
  initialSaved,
}: {
  placeId: string;
  sessionId: string;
  index: number;
  initialFeedback: PlaceFeedbackState | null;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved && initialFeedback?.action !== "exclude");
  const [excluded, setExcluded] = useState(initialFeedback?.action === "exclude");

  return (
    <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2">
      {!excluded && <SaveButton sessionId={sessionId} index={index} saved={saved} onChange={setSaved} />}
      <PlaceFeedback
        placeId={placeId}
        initial={initialFeedback}
        onExcluded={() => {
          setExcluded(true);
          setSaved(false);
        }}
        onUndone={() => setExcluded(false)}
      />
    </div>
  );
}
