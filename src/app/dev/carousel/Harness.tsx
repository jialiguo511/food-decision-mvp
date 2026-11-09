"use client";

import { useState } from "react";
import type { CookRecommendation } from "@/lib/types";
import type { Selection } from "@/app/today/recommendStore";
import Carousel from "@/app/today/results/Carousel";
import RecipeCard from "@/app/today/results/RecipeCard";

const recipe = (role: CookRecommendation["role"], title: string): CookRecommendation => ({
  decision_mode: "cook",
  role,
  title,
  reason: "A fixture recipe used to check the carousel. Not a real recommendation.",
  estimated_minutes: 15,
  estimated_meal_cost_usd: 4,
  estimated_extra_cost_usd: 0,
  estimated_calories: 520,
  estimated_protein_g: 32,
  watch: null,
  ingredients_on_hand: ["eggs", "rice"],
  ingredients_needed: [],
  equipment: ["pan"],
  steps: ["Cook the rice.", "Fry the eggs.", "Combine."],
  inventory_note: null,
  image_query: null,
});

const RECS = [recipe("best_match", "Egg fried rice"), recipe("lowest_effort", "Rice and soft eggs"), recipe("alternative", "Egg and rice bowl")];
const COLORS = ["#e8a87c", "#85a392", "#8e9aaf"];

type Call = { card: string; at: number };
const calls: Call[] = [];
const t0 = typeof performance === "undefined" ? 0 : performance.now();

// ?mode=ok (default) | fail (HTTP 500 first try per card) | genfail (reason
// generation_failed first try) | none (no_image) | broken (a URL that won't
// decode)   &delay=<ms> (default 1500). Retries after a failure succeed.
const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
const MODE = params.get("mode") ?? "ok";
const DELAY = Number(params.get("delay") ?? 1500);
const attempts: Record<string, number> = {};

// Stand-in for the paid route. Installed once, at module load in the browser.
if (typeof window !== "undefined" && !(window as unknown as { __harness?: boolean }).__harness) {
  (window as unknown as { __harness?: boolean }).__harness = true;
  (window as unknown as { __imageCalls: Call[] }).__imageCalls = calls;
  const real = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith("/api/image")) return real(input, init);
    const body = JSON.parse(String(init?.body ?? "{}")) as { session_id: string; index: number };
    calls.push({ card: `${body.session_id}:${body.index}`, at: Math.round(performance.now() - t0) });
    await new Promise((r) => setTimeout(r, DELAY));
    const n = (attempts[String(body.index)] = (attempts[String(body.index)] ?? 0) + 1);
    if (MODE === "fail" && n === 1) return new Response("boom", { status: 500 });
    if (MODE === "genfail" && n === 1) return Response.json({ url: null, reason: "generation_failed" });
    if (MODE === "none") return Response.json({ url: null, reason: "no_image" });
    if (MODE === "broken" && n === 1) return Response.json({ source: "generated", url: "data:image/png;base64,AAAA" });
    const label = `${body.index + 1} · ${RECS[body.index]?.title}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="100%" height="100%" fill="${COLORS[body.index]}"/><text x="50%" y="50%" font-size="90" text-anchor="middle" fill="#222">${label}</text></svg>`;
    return new Response(JSON.stringify({ source: "generated", url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

export default function Harness() {
  const [selection] = useState<Selection>({ status: "none" });
  return (
    <main className="mx-auto max-w-md px-5 py-6">
      <h1 className="mb-3 text-xl font-semibold">Carousel harness</h1>
      <Carousel label="Fixture options" labels={["Best match", "Easiest", "Different"]}>
        {RECS.map((r, i) => (
          <RecipeCard key={r.role} r={r} index={i as 0 | 1 | 2} sessionId="fixture" saved={false} selection={selection} onChoose={() => {}} />
        ))}
      </Carousel>
    </main>
  );
}
