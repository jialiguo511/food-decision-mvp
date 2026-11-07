"use client";

import HomeFlow from "@/app/today/HomeFlow";
import { calculateNutritionTargets } from "@/lib/nutrition";
import { DEFAULT_PROTEIN_TARGET_G } from "@/lib/options";
import { toProfileFormValues } from "@/lib/profile";
import { baseDefaults, rememberedDefaults } from "@/lib/recommend/rememberedDefaults";
import { cookContext } from "@/test/cookFixtures";
import type { Recommendation } from "@/lib/types";

// ?returning=1 — a user with a real earlier Cook session (remembered answers).
const returning = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("returning") === "1";

/** A deliberately dumb stand-in for the reader: keywords → fields. It mirrors
 *  what the real model is asked to do for the three example sentences. */
function fakeRead(text: string) {
  const t = text.toLowerCase();
  const i: Record<string, unknown> = {};
  if (/\b(cook|eggs|rice)\b|trained/.test(t) && !/don't want to cook/.test(t)) i.mode = "cook";
  else if (/nearby|order|delivery|pickup|\$/.test(t)) i.mode = "order";
  else if (/sweet|snack/.test(t)) i.mode = "store_snack";
  if (/very hungry|starving/.test(t)) i.hunger = "very_hungry";
  const minutes = t.match(/(\d+) ?min/);
  if (minutes) i.minutes = Number(minutes[1]);
  const foods = ["eggs", "rice"].filter((f) => t.includes(f));
  if (foods.length) i.foods = foods;
  if (/nearby/.test(t)) i.method = "eat_nearby";
  if (/\$15/.test(t)) i.meal_budget = "under_15";
  if (/sweet/.test(t)) i.snack_craving = "sweet";
  return i;
}

const recipe = (role: "best_match" | "lowest_effort" | "alternative", title: string): Recommendation => ({
  decision_mode: "cook", role, title, reason: "Fixture recipe — not a real recommendation.", estimated_minutes: 15,
  estimated_meal_cost_usd: 4, estimated_extra_cost_usd: 0, estimated_calories: 520, estimated_protein_g: 32, watch: null,
  ingredients_on_hand: ["eggs", "rice"], ingredients_needed: [], equipment: ["pan"], steps: ["Cook.", "Eat."], inventory_note: null, image_query: null,
});
const idea = (role: "best_match" | "lowest_effort" | "alternative", title: string): Recommendation => ({
  decision_mode: "order", role, title, reason: "Fixture idea — not a real recommendation.", search_terms: [title.toLowerCase()],
  order_notes: "Fixture.", modification: null, watch: null, estimated_calories: 600, estimated_protein_g: 35,
});

declare global {
  interface Window {
    __harness?: boolean;
    __sent?: { url: string; body: unknown }[];
  }
}

if (typeof window !== "undefined" && !window.__harness) {
  window.__harness = true;
  window.__sent = [];
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.endsWith("/api/recommend/interpret")) {
      window.__sent!.push({ url: "interpret", body: { chars: String(body?.text).length } }); // never the text
      await new Promise((r) => setTimeout(r, 700));
      if (/fail/i.test(body.text)) return Response.json({ error: "unavailable" }, { status: 502 });
      const interpretation = fakeRead(body.text);
      if (Object.keys(interpretation).length === 0) return Response.json({ error: "nothing_found" }, { status: 422 });
      return Response.json({ interpretation: { mode: null, hunger: null, minutes: null, effort: null, shopping: null, foods: [], extra_spend_usd: null, meal_budget: null, method: null, distance: null, craving: null, craving_category: null, snack_craving: null, ...interpretation } });
    }
    if (url.endsWith("/api/recommend")) {
      window.__sent!.push({ url: "recommend", body });
      await new Promise((r) => setTimeout(r, 900));
      const mode = body.context.decision_mode;
      const recommendations = mode === "cook" ? [recipe("best_match", "Egg fried rice"), recipe("lowest_effort", "Rice and soft eggs"), recipe("alternative", "Egg and rice bowl")] : mode === "order" ? [idea("best_match", "Chicken burrito bowl"), idea("lowest_effort", "Teriyaki rice bowl"), idea("alternative", "Poke bowl")] : [{ decision_mode: "store_snack", role: "best_match", title: "Dark chocolate squares", reason: "Fixture.", what_to_look_for: "70% cacao.", backup: null, watch: null, estimated_calories: 180, estimated_protein_g: 3 }];
      return Response.json({ recommendations, insufficient_inventory: false, nutrition_is_estimate: true, constraints: {}, model: "fixture", session_id: `fixture-${window.__sent!.length}` });
    }
    return real(input, init);
  };
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 37.77, longitude: -122.42, accuracy: 50 } } as GeolocationPosition) } });
}

const PROFILE = toProfileFormValues(null);

export default function Harness() {
  const defaults = returning ? rememberedDefaults([cookContext({ cook_minutes: 30, effort: "some", shopping: "can_buy", budget_override_usd: 10 })]) : baseDefaults();
  return (
    <main className="mx-auto max-w-md px-5 py-6">
      <HomeFlow
        ownerId="dev"
        defaults={defaults}
        kitchenStaples={[]}
        equipmentKnown
        avoidsFoods={false}
        nutritionTargets={calculateNutritionTargets(PROFILE, DEFAULT_PROTEIN_TARGET_G)}
        targetsSig={null}
        initialSession={null}
        initialChosenIndex={null}
        initialFeedback={null}
        initialPlaceFeedback={{}}
        onboardingProfile={null}
        nutritionProfile={null}
      />
    </main>
  );
}
