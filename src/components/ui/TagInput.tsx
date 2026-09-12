"use client";

import { useState } from "react";

/**
 * Free text, but only as a fallback. The common answers are chips elsewhere;
 * this is for the things we could not have guessed ("my roommate's tofu").
 */
export default function TagInput({
  values,
  placeholder,
  onChange,
}: {
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const tag = draft.trim();
    if (!tag) return;
    const exists = values.some((v) => v.toLowerCase() === tag.toLowerCase());
    if (!exists) onChange([...values, tag]);
    setDraft("");
  }

  return (
    <div>
      {values.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {values.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== tag))}
                className="rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-sm text-accent"
                aria-label={`Remove ${tag}`}
              >
                {tag} <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-xl border border-line px-4 text-sm font-medium text-muted"
        >
          Add
        </button>
      </div>
    </div>
  );
}
