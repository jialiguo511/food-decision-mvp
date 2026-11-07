"use client";

import { useState } from "react";
import { asksTravel } from "@/lib/places/travel";
import type { FormDefaults } from "@/lib/recommend/rememberedDefaults";
import type { ActiveSession, DecisionMode, OrderContext } from "@/lib/types";
import type { FormValues } from "./QuestionFlow";

/** The form only ever holds the category-flow fields. `nearby` marks a
 *  request, not an answer, so a restored nearby session's flag is dropped
 *  here and re-added only when a nearby search is actually requested. */
function toFormValues(context: OrderContext): OrderContext {
  const { nearby: _nearby, ...rest } = context;
  void _nearby;
  return rest;
}

/**
 * Each mode keeps its own answers, so moving between modes never loses what
 * was picked in another. The session being restored (if any) wins for its own
 * mode, so "Change" starts from the answers behind the cards on screen; every
 * other mode starts from its remembered defaults.
 */
export function useHomeForms(defaults: FormDefaults, initialSession: ActiveSession | null) {
  const restored = initialSession?.context ?? null;
  const [forms, setForms] = useState<FormValues>(() => ({
    cook: restored?.decision_mode === "cook" ? restored : defaults.cook,
    order: (() => {
      if (restored?.decision_mode !== "order") return defaults.order;
      const values = toFormValues(restored);
      // Travel only applies to Eat nearby and Pickup. A restored delivery
      // session's stored value is inert, so keep the remembered answer for
      // when the user switches over.
      return asksTravel(values.method) ? values : { ...values, travel_willingness: defaults.order.travel_willingness };
    })(),
    store_snack: restored?.decision_mode === "store_snack" ? restored : defaults.store_snack,
  }));

  function setForm<M extends DecisionMode>(mode: M, values: FormValues[M]) {
    setForms((current) => ({ ...current, [mode]: values }));
  }

  return { forms, setForm };
}
