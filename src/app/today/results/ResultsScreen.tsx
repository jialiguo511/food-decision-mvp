"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";
import type { NutritionTargets } from "@/lib/nutrition";
import { mealTargetsFor } from "@/lib/recommend/nutritionFit";
import type { ActiveSession, DecisionContext } from "@/lib/types";
import type { Understood } from "../flow/interpret";
import { contextSummary, loadingLines } from "../flow/summary";
import { BackButton } from "../flow/QuestionScreen";
import MealFeedback, { type FeedbackData } from "../MealFeedback";
import type { PlaceFeedbackState } from "../PlaceFeedback";
import type { NutritionNotice } from "../recommendStore";
import type { RequestStatus, Selection } from "../useRecommend";
import Carousel from "./Carousel";
import IdeaCard from "./IdeaCard";
import PlaceCard from "./PlaceCard";
import RecipeCard from "./RecipeCard";
import { inventoryNote, isInventoryLimited, isNearbySession } from "./sessionKind";
import { ErrorState, LoadingState, Notice } from "./States";

/**
 * Generating, errors, the cards, and the chosen state — all derived from
 * useRecommend's request/session/selection. `session` and `request` are
 * independent: a failed "3 more" keeps the last good cards on screen under a
 * short error. Loading replaces the cards, so a new set never mixes with old.
 */
export default function ResultsScreen({
  session,
  selection,
  request,
  requested,
  avoidsFoods,
  nutritionTargets,
  notice,
  initialFeedback,
  initialPlaceFeedback,
  onChoose,
  onRetry,
  onShowMore,
  onWhatToBuy,
  onIdeasByType,
  onChange,
  onStartOver,
  nutritionNudge,
  understood,
}: {
  session: ActiveSession | null;
  selection: Selection;
  request: RequestStatus;
  /** The context of the request in flight, for the loading lines. */
  requested: DecisionContext | null;
  avoidsFoods: boolean;
  nutritionTargets: NutritionTargets;
  /** Set when the cards were just re-scored against changed nutrition targets. */
  notice: NutritionNotice | null;
  initialFeedback: FeedbackData | null;
  initialPlaceFeedback: Record<string, PlaceFeedbackState>;
  onChoose: (index: 0 | 1 | 2) => void;
  onRetry: () => void;
  onShowMore: () => void;
  onWhatToBuy: () => void;
  onIdeasByType: () => void;
  onChange: () => void;
  onStartOver: () => void;
  /** Present only while the optional nutrition step is still on offer. */
  nutritionNudge?: { onOpen: () => void; onDismiss: () => void };
  /** Set when these cards came from a typed sentence: what was understood. */
  understood?: Understood | null;
}) {
  // The raw reason stays available to whoever is debugging, never on screen.
  useEffect(() => {
    if (request.kind === "error") console.error("[home] recommendation request failed:", request.error);
  }, [request]);

  const nearby = !!session && isNearbySession(session);
  const header = (
    <div className="flex items-center justify-between">
      <BackButton onClick={onStartOver} label="Start over" />
      <Button variant="quiet" onClick={onChange} className="-mr-3">
        Change
      </Button>
    </div>
  );

  if (request.kind === "locating" || request.kind === "loading") {
    // Derived from the request itself (not from which button started it), so
    // it is right after leaving Home and coming back mid-request.
    const searching = requested?.decision_mode === "order" && requested.nearby === true;
    const phase = request.kind === "locating" ? "locating" : searching ? "nearby" : "generate";
    return (
      <div>
        {header}
        <div className="pt-3">
          <LoadingState phase={phase} lines={requested ? loadingLines(requested, { avoidsFoods }) : []} startedAt={request.startedAt} />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div>
        {header}
        <div className="pt-3">
          {request.kind === "error" && (
            <ErrorState error={request.error} onRetry={onRetry} onIdeasByType={onIdeasByType} onChange={onChange} />
          )}
        </div>
      </div>
    );
  }

  const recs = session.recommendations;
  const mode = session.context.decision_mode;
  const limited = isInventoryLimited(session);
  const chosenIndex = selection.status === "chosen" ? selection.index : null;

  return (
    <div className="space-y-4">
      {header}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {nearby ? "Places near you" : mode === "cook" ? "Here's what to make" : mode === "order" ? "Here's what to get" : "Snacks to grab"}
        </h2>
        {understood ? <UnderstoodPanel understood={understood} onEdit={onChange} /> : <p className="mt-1 text-sm text-muted">{contextSummary(session.context).join(" · ")}</p>}
        <NutritionLine session={session} targets={nutritionTargets} notice={notice} />
      </div>

      {request.kind === "error" && (
        <ErrorState compact error={request.error} onRetry={onRetry} onIdeasByType={mode === "order" ? onIdeasByType : undefined} onChange={onChange} />
      )}

      {limited && (
        <Notice
          title={recs.length === 0 ? "Not enough here for a full meal." : (recs.map(inventoryNote).find((n) => n !== null) ?? "There may not be enough for a full meal.")}
          body={recs.length > 0 && recs.length < 3 ? "Only what you can make with what you have — nothing that needs something you don't." : undefined}
        />
      )}
      {nearby && recs.length === 0 && (
        <Notice title="No open places nearby right now." body="Try a wider distance, or get food ideas by type instead.">
          <Button onClick={onIdeasByType}>Get food ideas by type</Button>
          <Button variant="secondary" onClick={onChange}>
            Try a wider distance
          </Button>
        </Notice>
      )}
      {nearby && recs.length > 0 && recs.length < 3 && (
        <Notice title={`Only ${recs.length === 1 ? "one good option" : `${recs.length} good options`} near you right now.`} body="That's all we found open nearby — we don't pad the list." />
      )}

      {recs.length > 0 && (
        <Carousel key={session.session_id} label="Your options" initialIndex={chosenIndex ?? 0}>
          {recs.map((r, i) => {
            const index = i as 0 | 1 | 2;
            if (r.decision_mode === "cook") {
              return (
                <RecipeCard key={r.role} r={r} index={index} sessionId={session.session_id} saved={!!session.saved?.recipeIndexes.includes(index)} selection={selection} onChoose={onChoose} />
              );
            }
            if (r.decision_mode === "nearby") {
              return (
                <PlaceCard
                  key={r.role}
                  r={r}
                  index={index}
                  sessionId={session.session_id}
                  saved={!!session.saved?.placeIds.includes(r.place_id)}
                  feedback={initialPlaceFeedback[r.place_id] ?? null}
                  selection={selection}
                  onChoose={onChoose}
                />
              );
            }
            return <IdeaCard key={r.role} r={r} index={index} selection={selection} onChoose={onChoose} />;
          })}
        </Carousel>
      )}

      {recs.length > 0 && (
        <p className="text-xs text-muted">
          {nearby
            ? "Real places from Google Maps. We don't have their menus, so \"What to look for\" is a suggestion. If you have food allergies, check ingredients with the restaurant. Distances are approximate."
            : mode === "cook"
              ? "All numbers are estimates."
              : "All numbers are estimates — exact items aren't guaranteed to be available."}
        </p>
      )}

      {chosenIndex !== null && recs[chosenIndex] && (
        <MealFeedback
          key={session.session_id}
          sessionId={session.session_id}
          mealTitle={recs[chosenIndex].title}
          decisionMode={mode}
          nearby={nearby}
          initial={initialFeedback ?? { id: null, didEat: null, note: null }}
        />
      )}

      {limited ? (
        <Button onClick={onWhatToBuy}>Show me what to buy</Button>
      ) : (
        recs.length > 0 && (
          <div className="pt-2 text-center">
            <p className="text-sm text-muted">None of these?</p>
            <Button variant="secondary" className="mt-2" onClick={onShowMore}>
              Show me 3 more
            </Button>
          </div>
        )
      )}

      {nutritionNudge && recs.length > 0 && chosenIndex === null && (
        <section className="rounded-2xl border border-line bg-card p-4">
          <p className="text-sm font-semibold">Want better portion and protein suggestions?</p>
          <p className="mt-0.5 text-sm text-muted">Add a few details — about 30 seconds.</p>
          <div className="mt-2 flex items-center gap-1">
            <Button variant="quiet" onClick={nutritionNudge.onOpen} className="-ml-3 font-semibold">
              Add details
            </Button>
            <Button variant="quiet" onClick={nutritionNudge.onDismiss} className="text-muted">
              Not now
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

const kcalRange = (r: { low: number; high: number }) => `${roundTo(r.low, 50)}–${roundTo(r.high, 50)}`;
const gramsRange = (r: { low: number; high: number }) => `${roundTo(r.low, 5)}–${roundTo(r.high, 5)}`;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** What these cards were sized against, when the user's own details are behind
 *  it — plus, right after a re-score, what changed. Rough, an estimate, never a
 *  tally of the day. Nothing for nearby places (no nutrition data behind them)
 *  or for someone with no personal targets. */
function NutritionLine({ session, targets, notice }: { session: ActiveSession; targets: NutritionTargets; notice: NutritionNotice | null }) {
  const context = session.context;
  if (context.decision_mode === "order" && context.nearby === true) return null;
  const meal = mealTargetsFor(targets, context.hunger, context.decision_mode === "store_snack" ? "snack" : "meal");
  const shown = notice && notice.sessionId === session.session_id ? notice : null;
  if (!meal && !shown) return null;
  const parts = [meal?.kcal ? `~${kcalRange(meal.kcal)} kcal` : null, meal?.protein ? `~${gramsRange(meal.protein)} g protein` : null].filter(
    (p): p is string => p !== null,
  );
  return (
    <div className="mt-1.5 space-y-0.5">
      {shown && (
        <p role="status" className="animate-fade-in text-xs font-semibold text-accent">
          {shown.kind === "updated" ? "Updated for your nutrition goals" : "Checked against your nutrition goals — this order already fits"}
        </p>
      )}
      {parts.length > 0 && <p className="text-xs text-muted">Sized for you: {parts.join(" · ")} per serving (estimates)</p>}
    </div>
  );
}

/** What was read from the sentence, shown back so it can be corrected: the
 *  words as typed, then each part of the request — solid when the person said
 *  it, dotted when it was filled in from their own earlier answers. Edit opens
 *  the usual question screens with all of it already filled in. */
function UnderstoodPanel({ understood, onEdit }: { understood: Understood; onEdit: () => void }) {
  const assumed = understood.parts.some((p) => !p.said);
  const chip = "rounded-full px-2.5 py-1 text-xs font-medium";
  return (
    <section aria-label="What I understood" className="mt-2 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">What I understood</p>
        <Button variant="quiet" onClick={onEdit} className="-mr-3 -mt-2.5 font-semibold">
          Edit
        </Button>
      </div>
      <p className="line-clamp-2 text-sm italic text-ink/80">“{understood.text}”</p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {understood.parts.map((part) => (
          <li
            key={part.text}
            title={part.said ? undefined : "Filled in from your earlier answers"}
            className={`${chip} ${part.said ? "bg-cream text-ink/80 ring-1 ring-line" : "border border-dashed border-line text-muted"}`}
          >
            {part.text}
          </li>
        ))}
        {understood.foods.length > 0 && <li className={`${chip} bg-cream text-ink/80 ring-1 ring-line`}>Have: {understood.foods.join(", ")}</li>}
        {understood.craving && <li className={`${chip} bg-cream text-ink/80 ring-1 ring-line`}>Craving: {understood.craving}</li>}
      </ul>
      {assumed && <p className="mt-2 text-xs text-muted">Dotted ones weren&apos;t in your sentence — they&apos;re from your earlier answers.</p>}
    </section>
  );
}
