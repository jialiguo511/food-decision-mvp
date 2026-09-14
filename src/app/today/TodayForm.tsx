"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import TagInput from "@/components/ui/TagInput";
import { MultiChipGroup, SingleChipGroup } from "@/components/ui/ChipGroup";
import {
  COMMON_CRAVINGS,
  COOK_MINUTES,
  EFFORT_LEVELS,
  HUNGER_LEVELS,
  QUICK_INGREDIENTS,
} from "@/lib/options";
import type { ActiveSession, Effort, Hunger, MealContext } from "@/lib/types";
import BudgetCard from "./BudgetCard";
import type { FeedbackData } from "./MealFeedback";
import RecommendationResults from "./RecommendationResults";
import { useRecommend } from "./useRecommend";

const NO_CRAVING = "__none__";

export default function TodayForm({
  initial,
  usualBudget,
  initialSession,
  initialChosenIndex,
  initialFeedback,
}: {
  initial: MealContext;
  usualBudget: number;
  /** The most recent decision_sessions row, restored server-side — null on a
   *  first visit with no prior session. Restoring never calls the model. */
  initialSession: ActiveSession | null;
  initialChosenIndex: 0 | 1 | 2 | null;
  /** meal_feedback already recorded for that same session, if any. */
  initialFeedback: FeedbackData | null;
}) {
  const [values, setValues] = useState<MealContext>(initial);
  const { session, selection, request, run, retry, choose } = useRecommend({
    session: initialSession,
    chosenIndex: initialChosenIndex,
  });

  // initialFeedback was only ever read for initialSession. The moment a
  // regenerate or "Show me 3 more" swaps in a new session, that restored
  // feedback no longer applies to whatever is now active — a brand-new
  // session has no feedback yet regardless of what the last one had.
  const feedbackForCurrentSession =
    session && initialSession && session.session_id === initialSession.session_id ? initialFeedback : null;

  function set<K extends keyof MealContext>(key: K, value: MealContext[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  // The craving is a single value, not a tag list: either one of the presets or
  // whatever the user typed. Splitting it into these two derived values is what
  // lets a typed phrase deselect every chip, including "No preference".
  const preset =
    values.craving !== null &&
    (COMMON_CRAVINGS as readonly string[]).includes(values.craving)
      ? values.craving
      : null;
  const customCraving = preset === null ? (values.craving ?? "") : "";

  /** Finalizes whatever is in the craving box, then asks the recommender with
   *  the current form values. Used for both the first "Find my meal" and
   *  "Regenerate recommendations" — a regenerate is just another call with
   *  whatever the form says right now, edited or not. Runs only from the
   *  click handlers below — never from an effect — so one click is one
   *  request, and it always creates a new decision_sessions row. */
  function generate() {
    const finalized: MealContext = {
      ...values,
      craving: values.craving === null ? null : normalizeCraving(values.craving),
    };
    setValues(finalized);
    void run(finalized);
  }

  /** "Show me 3 more": same context as the current session, ignoring any
   *  unsaved edits sitting in the form, so it's a true re-roll rather than a
   *  regenerate in disguise. Sends the current set along as exclusions, so
   *  the model avoids near-duplicates instead of minor variations. Also
   *  creates a new decision_sessions row. */
  function showMore() {
    if (!session) return;
    setValues(session.context);
    void run(session.context, session.recommendations);
  }

  return (
    <div className="space-y-4">
      <Card title="How long do you have?">
        <SingleChipGroup
          options={COOK_MINUTES.map((m) => ({ value: String(m), label: `${m} min` }))}
          value={String(values.cook_minutes)}
          onChange={(value) => set("cook_minutes", Number(value))}
        />
      </Card>

      <Card title="How hungry are you?">
        <SingleChipGroup
          options={HUNGER_LEVELS}
          value={values.hunger}
          onChange={(value) => set("hunger", value as Hunger)}
        />
      </Card>

      <Card title="How much do you want to cook?">
        <SingleChipGroup
          options={EFFORT_LEVELS}
          value={values.effort}
          onChange={(value) => set("effort", value as Effort)}
        />
      </Card>

      <Card
        title="Craving anything?"
        hint="Tap one, or just describe it. Skip if nothing comes to mind."
      >
        <SingleChipGroup
          options={[
            { value: NO_CRAVING, label: "No preference" },
            ...COMMON_CRAVINGS.map((c) => ({ value: c, label: c })),
          ]}
          // An empty value matches no option, so typing clears every chip.
          value={preset ?? (customCraving === "" ? NO_CRAVING : "")}
          onChange={(value) =>
            set("craving", value === NO_CRAVING ? null : value)
          }
        />
        <input
          value={customCraving}
          // Do NOT trim here. This is a controlled input, so trimming on each
          // keystroke deletes the space the instant it is typed and the user
          // can never write more than one word. Normalizing happens on blur
          // and again when the context is captured.
          onChange={(event) => set("craving", event.target.value || null)}
          onBlur={(event) => set("craving", normalizeCraving(event.target.value))}
          placeholder="Or describe what sounds good…"
          aria-label="Describe your craving"
          className={`mt-3 w-full rounded-xl bg-card px-3 py-2 outline-none ${
            // Match the chips: when the typed text is the active craving, the
            // box is styled like a selected chip. That is the feedback that
            // says "this counts" — no Add button required.
            customCraving === ""
              ? "border border-line focus:border-accent"
              : "border border-accent text-accent"
          }`}
        />
      </Card>

      <Card
        title="Anything you want to use up?"
        hint="Optional. Helps us suggest something you can start right now."
      >
        <MultiChipGroup
          options={QUICK_INGREDIENTS}
          values={values.ingredients_on_hand.filter((i) =>
            (QUICK_INGREDIENTS as readonly string[]).includes(i),
          )}
          onChange={(picked) => {
            const custom = values.ingredients_on_hand.filter(
              (i) => !(QUICK_INGREDIENTS as readonly string[]).includes(i),
            );
            set("ingredients_on_hand", [...picked, ...custom]);
          }}
        />
        <div className="mt-3">
          <TagInput
            placeholder="Something else in the fridge…"
            values={values.ingredients_on_hand.filter(
              (i) => !(QUICK_INGREDIENTS as readonly string[]).includes(i),
            )}
            onChange={(custom) => {
              const picked = values.ingredients_on_hand.filter((i) =>
                (QUICK_INGREDIENTS as readonly string[]).includes(i),
              );
              set("ingredients_on_hand", [...picked, ...custom]);
            }}
          />
        </div>
      </Card>

      <BudgetCard
        usualBudget={usualBudget}
        value={values.budget_override_usd}
        onChange={(value) => set("budget_override_usd", value)}
      />

      <RecommendationResults
        session={session}
        selection={selection}
        request={request}
        initialFeedback={feedbackForCurrentSession}
        onRetry={retry}
        onChoose={choose}
      />

      {/* Sticky so the action is always reachable on a phone. Once a session
          exists, selecting a card does not remove or disable these — picking
          one should not lock the user out of trying again. */}
      <div className="sticky bottom-24 space-y-2 pt-2">
        <button
          type="button"
          onClick={generate}
          disabled={request.kind === "loading"}
          className="w-full rounded-2xl bg-accent py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/20 disabled:opacity-60"
        >
          {request.kind === "loading"
            ? "Finding your meal…"
            : session
              ? "Regenerate recommendations"
              : "Find my meal"}
        </button>
        {session && (
          <button
            type="button"
            onClick={showMore}
            disabled={request.kind === "loading"}
            className="w-full rounded-2xl border border-accent bg-card py-3 text-sm font-semibold text-accent disabled:opacity-60"
          >
            Show me 3 more
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Tidy a typed craving: drop surrounding whitespace and collapse runs of it.
 * Only ever called when the value is finalized — on blur, and when the context
 * is captured. Never on keystroke.
 */
function normalizeCraving(value: string): string | null {
  return value.trim().replace(/\s+/g, " ") || null;
}
