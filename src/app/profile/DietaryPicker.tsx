"use client";

import { useState } from "react";
import Chip from "@/components/ui/Chip";
import { DIETARY_PATTERNS } from "@/lib/options";
import type { DietaryPattern, ProfileFormValues } from "@/lib/types";

type Set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => void;

/**
 * "Do you follow a particular diet?" — a hard constraint in every mode, the same
 * as allergies, so what is picked here really does change what is suggested.
 * Several can apply (vegetarian + halal). "No preference" clears them; "Other"
 * takes the user's own words. Shared by first-run setup and Me.
 */
export default function DietaryPicker({
  patterns,
  other,
  set,
}: {
  patterns: DietaryPattern[];
  other: string | null;
  set: Set;
}) {
  const [otherOpen, setOtherOpen] = useState(other !== null);
  const [none, setNone] = useState(false);

  const toggle = (p: DietaryPattern) => {
    setNone(false);
    set("dietary_patterns", patterns.includes(p) ? patterns.filter((x) => x !== p) : [...patterns, p]);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Chip
          label="No preference"
          selected={none && patterns.length === 0 && other === null}
          onClick={() => {
            setNone(true);
            setOtherOpen(false);
            set("dietary_patterns", []);
            set("dietary_other", null);
          }}
        />
        {DIETARY_PATTERNS.map((d) => (
          <Chip key={d.value} label={d.label} selected={patterns.includes(d.value)} onClick={() => toggle(d.value)} />
        ))}
        <Chip
          label="Other"
          selected={otherOpen}
          onClick={() => {
            setNone(false);
            if (otherOpen) set("dietary_other", null);
            setOtherOpen(!otherOpen);
          }}
        />
      </div>
      {otherOpen && (
        <input
          value={other ?? ""}
          onChange={(e) => set("dietary_other", e.target.value.slice(0, 80) || null)}
          placeholder="Describe it, e.g. no red meat"
          aria-label="Other dietary pattern"
          className="mt-3 min-h-12 w-full rounded-2xl border border-line bg-card px-4 outline-none focus:border-accent"
        />
      )}
    </div>
  );
}
