"use client";

import HomeFlow from "@/app/today/HomeFlow";
import { calculateNutritionTargets } from "@/lib/nutrition";
import { DEFAULT_PROTEIN_TARGET_G } from "@/lib/options";
import { toProfileFormValues } from "@/lib/profile";
import { baseDefaults, rememberedDefaults } from "@/lib/recommend/rememberedDefaults";
import { cookContext } from "@/test/cookFixtures";
import { place } from "@/test/savedFixtures";
import type { Recommendation } from "@/lib/types";

// ?returning=1 — a user with a real earlier Cook session (remembered answers).
const returning = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("returning") === "1";

/** A deliberately dumb stand-in for the reader: keywords → fields. It mirrors
 *  what the real model is asked to do for the three example sentences. */
function fakeAdjust(text: string, adjusting: string) {
  // A stand-in for the reader when it is told the way of the request on screen: only what the message CHANGES.
  const t = text.toLowerCase();
  const i: Record<string, unknown> = {};
  if (/no (more )?snacks?|不吃零食|proper meal|正餐|dinner/.test(t + text)) i.meal_type = "meal";
  if (/i'?ll cook|cook (a|it|myself)|自己做/.test(t + text)) {
    i.mode = "cook";
    i.ways = ["cook"];
  } else if (/don'?t want to cook|not cooking|不想做饭|ready-?made|现成/.test(t + text)) i.ways = ["buy"];
  if (/just a snack|只要零食/.test(t + text)) {
    i.mode = "store_snack";
    i.meal_type = "snack";
  }
  const money = (t + text).match(/\$ ?(\d+)/);
  if (money) {
    const n = Number(money[1]);
    if (adjusting === "order") i.meal_budget = n <= 15 ? "under_15" : n <= 25 ? "15_to_25" : "25_to_40";
    else i.extra_spend_usd = n;
  }
  if (/don'?t care how long|no time limit|不在乎时间/.test(t + text)) i.clear = ["minutes"];
  return i;
}

function fakeRead(text: string) {
  const t = text.toLowerCase();
  const i: Record<string, unknown> = {};
  const onlyHave = /鸡蛋|米饭/.test(text) || /\b(eggs|rice)\b/.test(t);
  if (/buy or (make|cook)|买或做|can buy.*(make|cook)/.test(t + text)) i.ways = ["cook", "buy"];
  if (/不想做饭|don't want to cook/.test(t + text)) i.ways = ["buy"];
  if (/帮我决定|随便|you decide/.test(t + text)) i.leave_to_us = true;
  if (/marathon|after (a |my )?run|跑/.test(t + text)) i.after_exercise = true;
  if (/protein|蛋白/.test(t + text)) i.protein_focus = true;
  if (/not very hungry|not hungry/.test(t)) i.hunger = "light";
  const openAsked = i.ways !== undefined || i.leave_to_us === true;
  if (openAsked) {
    /* several ways or "you decide": no single mode */
  } else if (onlyHave || /\b(cook|eggs|rice)\b|trained/.test(t) && !/don't want to cook/.test(t)) i.mode = "cook";
  else if (/nearby|order|delivery|pickup|\$/.test(t)) i.mode = "order";
  else if (/sweet|snack/.test(t)) i.mode = "store_snack";
  if (onlyHave && !openAsked) i.shopping = "inventory_only";
  if (/(?<!not )very hungry|starving/.test(t)) i.hunger = "very_hungry";
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

// Nearby: a fixed pool of places (?pool=7). The stand-in below mimics the SERVER's
// rule — exclude everything in `shown_place_ids` plus the last batch, offer the
// next three, say "no_more" when none are left — so what is checked here is the
// browser: that it keeps the whole list, sends it back, and shows the right
// screen. That the REAL server excludes correctly is route.nearbyMore.test.ts.
const POOL_SIZE = typeof window === "undefined" ? 7 : Number(new URLSearchParams(window.location.search).get("pool") ?? 7);
const POOL = Array.from({ length: POOL_SIZE }, (_, n) => place({ place_id: `p${n + 1}`, title: `Fixture place ${n + 1}`, role: (["best_match", "lowest_effort", "alternative"] as const)[n % 3], photo_name: null }));

// ?failat=2&code=upstream_timeout — the 2nd recommend request fails with that server
// code (default upstream_error); add &html=504 to make it a host's HTML gateway page instead.
const FAIL_AT = typeof window === "undefined" ? 0 : Number(new URLSearchParams(window.location.search).get("failat") ?? 0);
const FAIL_CODE = typeof window === "undefined" ? "upstream_error" : (new URLSearchParams(window.location.search).get("code") ?? "upstream_error");
const FAIL_HTML = typeof window === "undefined" ? 0 : Number(new URLSearchParams(window.location.search).get("html") ?? 0);

// Pictures (the real route needs a signed-in user and Pexels): index 0 → a photo (a stand-in image),
// 1 → "no matching photo", 2 → a failed request that works on "Try again". ?img=none → all none.
const IMG_MODE = typeof window === "undefined" ? "mixed" : (new URLSearchParams(window.location.search).get("img") ?? "mixed");
const STAND_IN = (n: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="hsl(${n * 70 + 20} 55% 70%)"/><text x="320" y="190" font-size="28" text-anchor="middle" fill="#fff">stand-in photo ${n}</text></svg>`)}`;
const imageTries: Record<number, number> = {};

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
      window.__sent!.push({ url: "interpret", body: { chars: String(body?.text).length, adjusting: body?.adjusting ?? null } }); // never the text
      await new Promise((r) => setTimeout(r, 700));
      if (/fail/i.test(body.text)) return Response.json({ error: "unavailable" }, { status: 502 });
      const interpretation = body.adjusting ? fakeAdjust(body.text, body.adjusting) : fakeRead(body.text);
      if (Object.keys(interpretation).length === 0) return Response.json({ error: "nothing_found" }, { status: 422 });
      return Response.json({ interpretation: { mode: null, hunger: null, minutes: null, effort: null, shopping: null, foods: [], extra_spend_usd: null, meal_budget: null, method: null, distance: null, craving: null, craving_category: null, snack_craving: null, ways: [], leave_to_us: null, after_exercise: null, protein_focus: null, meal_type: null, clear: [], ...interpretation } });
    }
    if (url.endsWith("/api/image")) {
      window.__sent!.push({ url: "image", body });
      await new Promise((r) => setTimeout(r, 600));
      const i = Number(body.index);
      imageTries[i] = (imageTries[i] ?? 0) + 1;
      if (IMG_MODE === "none" || i === 1) return Response.json({ url: null, reason: "no_image" });
      if (i === 2 && imageTries[i] === 1) return Response.json({ error: "x" }, { status: 502 });
      return Response.json({ source: "photo", url: STAND_IN(i), photographerName: "Pat Example", photographerUrl: "https://www.pexels.com/@example", sourceUrl: "https://www.pexels.com/photo/1" });
    }
    if (url.endsWith("/api/recommend")) {
      window.__sent!.push({ url: "recommend", body });
      await new Promise((r) => setTimeout(r, 900));
      const mode = body.context.decision_mode;
      const nth = window.__sent!.filter((x) => x.url === "recommend").length;
      if (FAIL_AT > 0 && nth === FAIL_AT) {
        if (FAIL_HTML) return new Response("<html>An error occurred with your deployment</html>", { status: FAIL_HTML, headers: { "Content-Type": "text/html" } });
        return Response.json({ error: { code: FAIL_CODE, message: "internal detail" } }, { status: 502 });
      }
      if (mode === "order" && body.context.nearby === true) {
        const shown = new Set<string>([...(body.shown_place_ids ?? []), ...(body.previous_recommendations ?? []).map((r: { place_id: string }) => r.place_id)]);
        const fresh = POOL.filter((p) => !shown.has(p.place_id)).slice(0, 3).map((p, i) => ({ ...p, role: (["best_match", "lowest_effort", "alternative"] as const)[i] }));
        if (shown.size > 0 && fresh.length === 0) return Response.json({ no_more: true, shown_place_ids: [...shown] });
        return Response.json({ recommendations: fresh, insufficient_inventory: false, nutrition_is_estimate: true, constraints: {}, model: "rules", session_id: `fixture-${window.__sent!.length}`, shown_place_ids: [...shown, ...fresh.map((p) => p.place_id)] });
      }
      const mixed: Recommendation[] = [
        { ...(recipe("best_match", "Tuna and cucumber wrap") as Extract<Recommendation, { decision_mode: "cook" }>), ingredients_on_hand: [], ingredients_needed: ["canned tuna", "tortilla", "cucumber"], equipment: [], steps: ["Drain the tuna.", "Wrap it."], estimated_minutes: 8 },
        { decision_mode: "store_snack", role: "lowest_effort", title: "Greek yogurt cup", reason: "Fixture.", what_to_look_for: "Plain, single-serve.", backup: null, watch: null, estimated_calories: 150, estimated_protein_g: 15 },
        idea("alternative", "Chicken rice bowl"),
      ];
      const recommendations = mode === "open" ? (body.context.meal_only ? [idea("best_match", "Chicken burrito bowl"), idea("lowest_effort", "Teriyaki rice bowl"), idea("alternative", "Poke bowl")] : body.context.ways?.cook === false ? [idea("best_match", "Chicken burrito bowl"), mixed[1], idea("alternative", "Poke bowl")] : mixed) : mode === "cook" ? [recipe("best_match", "Egg fried rice"), recipe("lowest_effort", "Rice and soft eggs"), recipe("alternative", "Egg and rice bowl")] : mode === "order" ? [idea("best_match", "Chicken burrito bowl"), idea("lowest_effort", "Teriyaki rice bowl"), idea("alternative", "Poke bowl")] : [{ decision_mode: "store_snack", role: "best_match", title: "Dark chocolate squares", reason: "Fixture.", what_to_look_for: "70% cacao.", backup: null, watch: null, estimated_calories: 180, estimated_protein_g: 3 }];
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
        allergyStatus="listed"
      />
    </main>
  );
}
