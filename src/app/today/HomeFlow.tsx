"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { Interpretation } from "@/lib/interpret/schema";
import type { NutritionTargets } from "@/lib/nutrition";
import { toMealContext } from "@/lib/recommend/cookForm";
import type { FormDefaults } from "@/lib/recommend/rememberedDefaults";
import { normalizeCraving } from "@/lib/text";
import type { ActiveSession, DecisionMode, MealContext, OrderContext, ProfileFormValues } from "@/lib/types";
import { dismissNutritionStep } from "./actions";
import { createAdvanceScheduler } from "./flow/advance";
import EquipmentScreen from "./flow/EquipmentScreen";
import ClarifyScreen, { KindScreen } from "./flow/ClarifyScreen";
import { homeReducer, initialScreen, modeToChange } from "./flow/homeReducer";
import { applyInterpretation, describeUnderstanding, type ClarifyStep, type Said, type Understood } from "./flow/interpret";
import QuestionFlow, { type FormValues } from "./flow/QuestionFlow";
import StartScreen, { ModeScreen } from "./flow/StartScreen";
import { ingredientsStepIndex, searchesNearby } from "./flow/steps";
import { contextSummary, ctaLabel } from "./flow/summary";
import { useHomeForms } from "./flow/useHomeForms";
import { interpretErrorCopy, interpretText } from "./interpretClient";
import type { Entry } from "./recommendStore";
import { track } from "./track";
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

  // The one-sentence entry. The text, the read in progress, and — once a
  // sentence has been read but still needs something — what was read. The
  // sentence is kept only here, in memory: never stored, never sent anywhere
  // but the one read. A newer read, or leaving for another path, makes an
  // older one's answer arrive to nothing (readId).
  const [draft, setDraft] = useState("");
  const [describing, setDescribing] = useState(false);
  const [describeError, setDescribeError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [understood, setUnderstood] = useState<Understood | null>(null);
  const readId = useRef(0);

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
   *  this tap; Delivery (or `byType`) gets food ideas by type. `source` is the
   *  answers to send (the sentence entry passes its own, because state set a
   *  moment ago is not yet visible); `sentence` is what to show back on the
   *  results, and is cleared by every other way of asking. */
  function find(mode: DecisionMode, byType = false, source: FormValues = forms, sentence: Understood | null = null, entry: Entry = sentence ? "sentence" : "steps") {
    clearAdvance();
    readId.current++; // an unfinished read must not start a second request
    setDescribing(false);
    setPending(null);
    setUnderstood(sentence);
    if (mode === "cook") {
      const cooked = toMealContext({ ...source.cook, craving: source.cook.craving === null ? null : normalizeCraving(source.cook.craving) });
      // Unreachable from the screens (Continue is disabled until answered) —
      // but a request is never built from a fallback: send them to the
      // question instead.
      if (!cooked) return dispatch({ type: "customize", mode: "cook" });
      setUsed((current) => ({ ...current, cook: true }));
      dispatch({ type: "showResults" });
      setForm("cook", cooked);
      void run(cooked, undefined, entry);
      return;
    }
    setUsed((current) => ({ ...current, [mode]: true }));
    dispatch({ type: "showResults" });
    if (mode === "order") {
      const finalized: OrderContext = {
        ...source.order,
        craving_note: source.order.craving_note === null ? null : normalizeCraving(source.order.craving_note),
      };
      setForm("order", finalized);
      const nearby = !byType && searchesNearby(finalized);
      void run(nearby ? { ...finalized, nearby: true } : finalized, undefined, entry);
    } else {
      void run(source.store_snack, undefined, entry);
    }
  }

  // ---- the sentence entry -------------------------------------------------

  /** "Help me decide": read the sentence once, then either go straight to the
   *  three cards or ask only for what is missing. A failed read keeps the text. */
  async function describe() {
    const text = draft.trim();
    if (!text || describing) return;
    const id = ++readId.current;
    setDescribing(true);
    setDescribeError(null);
    track({ name: "entry_selected", props: { entry: "sentence" } });
    const result = await interpretText(text);
    if (id !== readId.current) return; // the person went elsewhere meanwhile
    setDescribing(false);
    if (!result.ok) return setDescribeError(interpretErrorCopy(result.error));
    proceed(text, result.interpretation);
  }

  /** What was read → the next screen. The merged answers become this mode's
   *  answers, so Edit and Change start from them. */
  function proceed(text: string, interpretation: Interpretation, forcedMode?: DecisionMode, equipmentOk = equipmentSaved) {
    const applied = applyInterpretation(interpretation, forms, used, forcedMode);
    if (applied.status === "needs_mode") {
      setPending({ text, interpretation, mode: null, said: [], missing: [] });
      track({ name: "clarify_shown", props: { asked: 1 } });
      return dispatch({ type: "clarify" });
    }
    setForm(applied.mode, applied.forms[applied.mode] as never);
    const missing = applied.status === "needs_answers" ? applied.missing : [];
    setPending({ text, interpretation, mode: applied.mode, said: applied.said, missing });
    // Cook needs to know what they can cook with, once; ask, then carry on.
    if (applied.mode === "cook" && !equipmentOk) return dispatch({ type: "askEquipment" });
    if (missing.length > 0) {
      track({ name: "clarify_shown", props: { mode: applied.mode, asked: Math.min(missing.length, 6) } });
      return dispatch({ type: "clarify" });
    }
    sendSentence(text, applied.mode, applied.forms, applied.said);
  }

  function sendSentence(text: string, mode: DecisionMode, source: FormValues, said: Said[]) {
    setDraft("");
    find(mode, false, source, describeUnderstanding(text, mode, source, said));
  }

  /** "Show me 3 more": the session's own context, with its cards sent as
   *  exclusions. A true re-roll — the answers can't have drifted from it,
   *  because changing an answer means leaving the results screen. */
  function showMore() {
    if (!session) return;
    void run(session.context, session.recommendations, "more");
  }

  /** After a thin or empty "Use what I have": the same question with a few
   *  purchases allowed, optimized for the fewest items. */
  function showWhatToBuy() {
    if (!session || session.context.decision_mode !== "cook") return;
    const next: MealContext = { ...session.context, shopping: "can_buy", budget_override_usd: null, minimize_purchases: true };
    setUnderstood(null);
    setForm("cook", next);
    void run(next);
  }

  /** Entering a mode: Cook asks what you can cook with first, once, if never
   *  said — everything else goes straight in. */
  function pick(mode: DecisionMode) {
    track({ name: "entry_selected", props: { entry: "steps", mode } });
    readId.current++;
    setDescribing(false);
    setPending(null);
    if (mode === "cook" && !equipmentSaved) return dispatch({ type: "askEquipment" });
    dispatch({ type: "pickMode", mode, hasMemory: used[mode] });
  }

  /** The one CTA of a used mode. A restored "Use what I have" has no foods
   *  (they're never remembered), so it goes to that question instead of
   *  running on nothing — strict inventory-only stays strict. */
  function go(mode: DecisionMode, entry: Entry = "steps") {
    if (mode === "cook" && !equipmentSaved) return dispatch({ type: "askEquipment" });
    if (mode === "cook" && forms.cook.shopping === "inventory_only" && forms.cook.ingredients_on_hand.length === 0) {
      return dispatch({ type: "customize", mode, step: ingredientsStepIndex(forms.cook) });
    }
    find(mode, false, forms, null, entry);
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
          // A sentence was waiting on this answer: carry on with it.
          if (pending?.mode === "cook") return proceed(pending.text, pending.interpretation, "cook", true);
          dispatch({ type: "pickMode", mode: "cook", hasMemory: used.cook });
        }}
      />
    );
  }

  if (screen.name === "clarify" && pending) {
    if (!pending.mode) return <KindScreen onPick={(mode) => proceed(pending.text, pending.interpretation, mode)} onBack={back} />;
    const mode = pending.mode;
    return (
      <ClarifyScreen
        mode={mode}
        forms={forms}
        setForm={setForm}
        initialMissing={pending.missing}
        remembered={used.order}
        kitchenStaples={kitchenStaples}
        budgetUsual={defaults.budgetUsual}
        // What the person answered here is theirs, just like what they typed.
        onFind={(answered) => sendSentence(pending.text, mode, forms, [...pending.said, ...answered.flatMap(fieldsOf)])}
        onBack={back}
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
        understood={understood}
      />
    );
  }

  // The mode to offer "Use again" for: the one just used, else the most
  // recent in history — and only if there is something real behind it.
  const lastTimeMode = lastMode ?? defaults.mode;
  return (
    <StartScreen
      lastTime={used[lastTimeMode] ? { mode: lastTimeMode, summary: contextSummary(forms[lastTimeMode]) } : null}
      onUseAgain={() => {
        track({ name: "entry_selected", props: { entry: "again", mode: lastTimeMode } });
        go(lastTimeMode, "again");
      }}
      onPickMode={pick}
      onBackToPicks={session || request.kind !== "idle" ? () => dispatch({ type: "showResults" }) : undefined}
      draft={draft}
      onDraft={(text) => {
        setDraft(text);
        if (describeError) setDescribeError(null);
      }}
      onDescribe={() => void describe()}
      describing={describing}
      describeError={describeError}
    />
  );
}

/** A sentence that has been read and is waiting on something: an answer, the
 *  kind of help, or the Cook equipment question. */
type Pending = {
  text: string;
  interpretation: Interpretation;
  /** null = the sentence didn't say what kind of help. */
  mode: DecisionMode | null;
  said: Said[];
  missing: ClarifyStep[];
};

/** The summary fields a clarify question covers — they were answered by the
 *  person, so they count as said. */
function fieldsOf(step: ClarifyStep): Said[] {
  switch (step) {
    case "time_effort":
      return ["time", "effort"];
    case "shopping":
      return ["shopping"];
    case "budget":
      return ["budget"];
    case "ingredients":
      return ["foods"];
    case "method":
      return ["method"];
  }
}
