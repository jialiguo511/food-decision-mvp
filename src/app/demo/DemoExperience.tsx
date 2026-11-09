"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import Carousel from "@/app/today/results/Carousel";
import { Pills } from "@/app/today/results/ResultCard";
import UnderstoodPanel from "@/app/today/results/UnderstoodPanel";
import { DEMO_SCENARIOS, type DemoCard } from "./demoData";

/**
 * A fixed example of the flow: a sentence, what the app understood from it, and
 * three options. Static on purpose — no sign-in, no model call, no account, no
 * data about anyone — and labelled as an example everywhere it could be mistaken
 * for a live result. The panel and the carousel are the real components; the
 * content is hand-written (demoData.ts).
 */
export default function DemoExperience() {
  const [id, setId] = useState(DEMO_SCENARIOS[0].id);
  const scenario = DEMO_SCENARIOS.find((s) => s.id === id) ?? DEMO_SCENARIOS[0];

  return (
    <div>
      <p role="note" className="rounded-2xl border border-dashed border-accent/50 bg-accent-soft/50 px-4 py-3 text-sm">
        <strong>This is an example.</strong> Nothing here was generated for you — it&apos;s a fixed walkthrough of what the app does with one sentence.
      </p>

      <div role="tablist" aria-label="Example situations" className="mt-5 flex flex-wrap gap-2">
        {DEMO_SCENARIOS.map((s) => (
          <button
            key={s.id}
            role="tab"
            type="button"
            aria-selected={s.id === id}
            onClick={() => setId(s.id)}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${s.id === id ? "border-accent bg-accent text-white" : "border-line bg-card text-ink"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div key={scenario.id} role="tabpanel" className="animate-fade-in mt-5 space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">{scenario.heading}</h2>
        <UnderstoodPanel understood={scenario.understood} onEdit={() => {}} readOnly defaultOpen />
        <p className="px-1 text-xs text-muted">{scenario.note}</p>
        <Carousel label="Example options" labels={scenario.cards.map((card) => card.role.replace("Lowest effort", "Easiest").replace("Something different", "Different").replace("Easy to order", "Easiest").replace("Most satisfying", "Filling").replace("Lighter option", "Lighter"))}>
          {scenario.cards.map((card) => (
            <ExampleCard key={card.title} card={card} />
          ))}
        </Carousel>
        <p className="text-xs text-muted">All numbers are estimates.</p>
      </div>

      <div className="mt-8 space-y-3 rounded-3xl border border-line bg-card p-5">
        <p className="text-base font-semibold">Try it with your own situation</p>
        <p className="text-sm text-muted">Sign in with an email link, say what&apos;s going on, and get three options fitted to you.</p>
        <Link href="/login" className={buttonClass("primary")}>
          Sign in to try it
        </Link>
        <Link href="/about" className="block text-center text-sm text-muted underline">
          About this beta, privacy and estimates
        </Link>
      </div>
    </div>
  );
}

function ExampleCard({ card }: { card: DemoCard }) {
  return (
    <article className="rounded-3xl border border-line bg-card p-4 shadow-[0_1px_3px_rgba(42,37,32,0.06)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">{card.role}</p>
        <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-line">Example</span>
      </div>
      <h3 className="mt-1 text-lg font-semibold leading-snug">{card.title}</h3>
      <div className="mt-3">
        <Pills items={card.pills} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink/90">{card.reason}</p>
      {card.detail && (
        <p className="mt-2 text-sm text-muted">
          <span className="font-medium text-ink/80">{card.detail.label}:</span> {card.detail.text}
        </p>
      )}
    </article>
  );
}
