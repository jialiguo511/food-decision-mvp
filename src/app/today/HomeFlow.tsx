"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { NutritionTargets } from "@/lib/nutrition";
import { toMealContext } from "@/lib/recommend/cookForm";
import type { FormDefaults } from "@/lib/recommend/rememberedDefaults";
import { normalizeCraving } from "@/lib/text";
import type { ActiveSession, DecisionMode, MealContext, OrderContext, ProfileFormValues } from "@/lib/types";
import { dismissNutritionStep } from "./actions";
import { createAdvanceScheduler } from "./flow/advance";
import EquipmentScreen from "./flow/EquipmentScreen";
import { homeReducer, initialScreen, modeToChange } from "./flow/homeReducer";
import QuestionFlow from "./flow/QuestionFlow";
import StartScreen, { ModeScreen } from "./flow/StartScreen";
import { ingredientsStepIndex, searchesNearby } from "./flow/steps";
import { contextSummary, ctaLabel } from "./flow/summary";
import { useHomeForms } from "./flow/useHomeForms";
import type { FeedbackData } from "./MealFeedback";
import NutritionStep from "./onboarding/NutritionStep";
import Onboarding from "./onboarding/Onboarding";
import type { PlaceFeedbackState } from "./PlaceFeedback";
import ResultsScreen from "./results/ResultsScreen";
import { useRecommend } from "./useRecommend";

/**
 * Home: one decision at a time. The reducer decides which screen shows
 * (flow/homeReducer.ts); useRecommend owns the request, the session and the
 * selection — outside React, so leaving Home mid-request and coming back shows
 * that request, not an older page (recommendStore.ts); useHomeForms owns the
 * answers. Every request starts from a click handler below — never an effect —
 * so one tap is one request.
 */
export default function HomeFlow({
  ownerId,
  defaults,
  kitchenStaples,
  equipmentKnown,
  avoidsFoods,
  nutritionTargets,
  targetsSig,
  initialSession,
  initialChosenIndex,
  initialFeedback,
  initialPlaceFeedback,
  onboardingProfile,
  nutritionProfile,
}: {
  /** The signed-in user — the recommendation state belongs to them. */
  ownerId: string;
  /** Where answers start, per mode — remembered from recent sessions. */
  defaults: FormDefaults;
  /** Persistent condiments/seasonings only (Me). Never actual food. */
  kitchenStaples: string[];
  /** The user has told us what they can cook with. If not, Cook asks first. */
  equipmentKnown: boolean;
  /** The Profile lists allergies or disliked foods — only used to say so
   *  while a request loads. */
  avoidsFoods: boolean;
  /** The user's current nutrition targets (one meal is sized from them). */
  nutritionTargets: NutritionTargets;
  /** Signature of the targets when something personal is behind them, else
   *  null. A change under cards on screen re-scores them. */
  targetsSig: string | null;
  /** A recent (≤6h) session restored server-side; null otherwise. */
  initialSession: ActiveSession | null;
  initialChosenIndex: 0 | 1 | 2 | null;
  initialFeedback: FeedbackData | null;
  initialPlaceFeedback: Record<string, PlaceFeedbackState>;
  /** Set only when first-run setup should be offered; the current Profile. */
  onboardingProfile: ProfileFormValues | null;
  /** Set only when the optional nutrition step may be offered after results. */
  nutritionProfile: ProfileFormValues | null;
}) {
  const { session, selection, request, requested, notice, live, run, retry, choose, ensureEnriched, rescore } = useRecommend(ownerId, {
    session: initialSession,
    chosenIndex: initialChosenIndex,
  });
  // A request this tab already has (running, failed, or its cards) decides the
  // opening screen — never the older page the server happened to render.
  const [screen, dispatch] = useReducer(homeReducer, undefined, () =>
    initialScreen({ hasSession: live || !!initialSession, needsOnboarding: !!onboardingProfile }),
  );
  const { forms, setForm } = useHomeForms(defaults, session);
  // The mode of the most recent request, so "Change" still knows where to go
  // when that request failed and there is no session to read it from.
  const lastMode: DecisionMode | null = requested?.decision_mode ?? null;
  // Modes with answers worth showing back: those in the user's history, plus
  // any run since this page loaded (the server's `remembered` is read once, so
  // without this a mode used a minute ago would look new). A mode's *answers*
  // live in `forms`; this only says whether they came from real use.
  const [used, setUsed] = useState(defaults.remembered);
  // Nutrition step finished or dismissed since load — the server flag is stale.
  const [nutritionDone, setNutritionDone] = useState(false);
  // Cook equipment answered since load — the server flag is stale.
  const [equipmentSaved, setEquipmentSaved] = useState(equipmentKnown);

  // Nearby places restored without their wording (the user left before it
  // arrived): ask for it once.
  useEffect(() => {
    if (session && request.kind === "idle") ensureEnriched(session);
  }, [session, request.kind, ensureEnriched]);

  // The user's nutrition targets changed since these cards were made — details
  // just saved from the nudge, or edited in Me: re-score the cards on screen
  // (deterministic, no model) so the change shows. A pick already made is never
  // shuffled; the server skips it.
  useEffect(() => {
    if (!session || !targetsSig || request.kind !== "idle" || selection.status !== "none") return;
    if (session.targets_sig !== targetsSig) rescore(session, targetsSig, live);
  }, [session, targetsSig, request.kind, selection.status, live, rescore]);

  // One pending move at a time (flow/advance.ts): a second tap, Back, Continue
  // or the final button cancels it, so a quick double tap is one navigation.
  const advance = useRef(createAdvanceScheduler());
  const clearAdvance = () => advance.current.cancel();
  useEffect(() => clearAdvance, []);
  function next(stepCount: number, auto: boolean, from: number) {
    clearAdvance();
    // `from` makes a late move harmless: if the screen has since moved (Back,
    // Continue), the reducer ignores it.
    const move = () => dispatch({ type: "next", stepCount, from });
    if (auto) advance.current.schedule(move);
    else move();
  }
  const back = () => {
    clearAdvance();
    dispatch({ type: "back" });
  };

  /** From the last question: `auto` = the tap on a pure single choice (after the
   *  same beat as any auto-advance, so the choice registers first); otherwise the
   *  button. One timer for both, so a second tap can't send two requests. */
  function finish(mode: DecisionMode, auto: boolean) {
    clearAdvance();
    if (auto) advance.current.schedule(() => find(mode));
    else find(mode);
  }

  /** Finalizes free-text cravings, then asks for this mode's three. Pickup and
   *  Eat nearby search real places — the location prompt can only follow
   *  this tap; Delivery (or `byType`) gets food ideas by type. */
  function find(mode: DecisionMode, byType = false) {
    clearAdvance();
    if (mode === "cook") {
      const cooked = toMealContext({ ...forms.cook, craving: forms.cook.craving === null ? null : normalizeCraving(forms.cook.craving) });
      // Unreachable from the screens (Continue is disabled until answered) —
      // but a request is never built from a fallback: send them to the
      // question instead.
      if (!cooked) return dispatch({ type: "customize", mode: "cook" });
      setUsed((current) => ({ ...current, cook: true }));
      dispatch({ type: "showResults" });
      setForm("cook", cooked);
      void run(cooked);
      return;
    }
    setUsed((current) => ({ ...current, [mode]: true }));
    dispatch({ type: "showResults" });
    if (mode === "order") {
      const finalized: OrderContext = {
        ...forms.order,
        craving_note: forms.order.craving_note === null ? null : normalizeCraving(forms.order.craving_note),
      };
      setForm("order", finalized);
      const nearby = !byType && searchesNearby(finalized);
      void run(nearby ? { ...finalized, nearby: true } : finalized);
    } else {
      void run(forms.store_snack);
    }
  }

  /** "Show me 3 more": the session's own context, with its cards sent as
   *  exclusions. A true re-roll — the answers can't have drifted from it,
   *  because changing an answer means leaving the results screen. */
  function showMore() {
    if (!session) return;
    void run(session.context, session.recommendations);
  }

  /** After a thin or empty "Use what I have": the same question with a few
   *  purchases allowed, optimized for the fewest items. */
  function showWhatToBuy() {
    if (!session || session.context.decision_mode !== "cook") return;
    const next: MealContext = { ...session.context, shopping: "can_buy", budget_override_usd: null, minimize_purchases: true };
    setForm("cook", next);
    void run(next);
  }

  /** Entering a mode: Cook asks what you can cook with first, once, if never
   *  said — everything else goes straight in. */
  function pick(mode: DecisionMode) {
    if (mode === "cook" && !equipmentSaved) return dispatch({ type: "askEquipment" });
    dispatch({ type: "pickMode", mode, hasMemory: used[mode] });
  }

  /** The one CTA of a used mode. A restored "Use what I have" has no foods
   *  (they're never remembered), so it goes to that question instead of
   *  running on nothing — strict inventory-only stays strict. */
  function go(mode: DecisionMode) {
    if (mode === "cook" && !equipmentSaved) return dispatch({ type: "askEquipment" });
    if (mode === "cook" && forms.cook.shopping === "inventory_only" && forms.cook.ingredients_on_hand.length === 0) {
      return dispatch({ type: "customize", mode, step: ingredientsStepIndex(forms.cook) });
    }
    find(mode);
  }

  /** "Not now": hides the step at once; the dismissal is stored best-effort —
   *  if that fails the step may come back next visit, which costs nothing. */
  function dismissNutrition() {
    setNutritionDone(true);
    dispatch({ type: "nutritionDone" });
    void dismissNutritionStep();
  }

  const noteFor = (mode: DecisionMode) => {
    if (mode === "cook" && forms.cook.shopping === "can_buy") return "Assumes you can pick up a few things.";
    if (mode === "cook" && forms.cook.shopping === "inventory_only") return "You'll pick what you have first.";
    if (mode === "order" && searchesNearby(forms.order)) return "Uses your location once for this search. It isn't saved.";
    return undefined;
  };
  const modeCta = (mode: DecisionMode) =>
    mode === "cook" && forms.cook.shopping === "inventory_only" && forms.cook.ingredients_on_hand.length === 0 ? "Pick what you have" : ctaLabel(forms[mode]);

  if (screen.name === "onboarding" && onboardingProfile) {
    return <Onboarding initial={onboardingProfile} onDone={() => dispatch({ type: "onboarded" })} />;
  }

  if (screen.name === "nutrition" && nutritionProfile) {
    return (
      <NutritionStep
        initial={nutritionProfile}
        onBack={back}
        onDismiss={dismissNutrition}
        onDone={() => {
          setNutritionDone(true);
          dispatch({ type: "nutritionDone" });
        }}
      />
    );
  }

  if (screen.name === "equipment") {
    return (
      <EquipmentScreen
        onBack={back}
        onDone={() => {
          setEquipmentSaved(true);
          dispatch({ type: "pickMode", mode: "cook", hasMemory: used.cook });
        }}
      />
    );
  }

  if (screen.name === "mode" && used[screen.mode]) {
    const mode = screen.mode;
    return (
      <ModeScreen
        mode={mode}
        summary={contextSummary(forms[mode])}
        note={noteFor(mode)}
        cta={modeCta(mode)}
        onFind={() => go(mode)}
        onEdit={() => dispatch({ type: "customize", mode })}
        onBack={() => dispatch({ type: "start" })}
      />
    );
  }

  if (screen.name === "questions") {
    return (
      <QuestionFlow
        mode={screen.mode}
        step={screen.step}
        forms={forms}
        setForm={setForm}
        onNext={next}
        onBack={back}
        onFinish={(auto) => finish(screen.mode, auto)}
        onIdeasByType={() => find("order", true)}
        budgetUsual={defaults.budgetUsual}
        kitchenStaples={kitchenStaples}
      />
    );
  }

  if (screen.name === "results" && (session || request.kind !== "idle")) {
    const isRestored = !!session && !!initialSession && session.session_id === initialSession.session_id;
    return (
      <ResultsScreen
        session={session}
        selection={selection}
        request={request}
        requested={requested}
        avoidsFoods={avoidsFoods}
        nutritionTargets={nutritionTargets}
        notice={notice}
        // Restored feedback belongs to the restored session only.
        initialFeedback={isRestored ? initialFeedback : null}
        initialPlaceFeedback={isRestored ? initialPlaceFeedback : {}}
        onChoose={choose}
        onRetry={retry}
        onShowMore={showMore}
        onWhatToBuy={showWhatToBuy}
        onIdeasByType={() => find("order", true)}
        onChange={() => dispatch({ type: "customize", mode: modeToChange(session?.context.decision_mode ?? null, lastMode) })}
        onStartOver={() => dispatch({ type: "start" })}
        nutritionNudge={
          nutritionProfile && !nutritionDone ? { onOpen: () => dispatch({ type: "openNutrition" }), onDismiss: dismissNutrition } : undefined
        }
      />
    );
  }

  // The mode to offer "Use again" for: the one just used, else the most
  // recent in history — and only if there is something real behind it.
  const lastTimeMode = lastMode ?? defaults.mode;
  return (
    <StartScreen
      lastTime={used[lastTimeMode] ? { mode: lastTimeMode, summary: contextSummary(forms[lastTimeMode]) } : null}
      onUseAgain={() => go(lastTimeMode)}
      onPickMode={pick}
      onBackToPicks={session || request.kind !== "idle" ? () => dispatch({ type: "showResults" }) : undefined}
    />
  );
}
