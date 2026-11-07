// Can a faster model configuration give similarly useful Cook recommendations?
//
//   BENCH_CONFIRM=1 npm run bench:recommend                  # configs A, B, C, D × 7 cases × 1 run
//   BENCH_CONFIRM=1 BENCH_CONFIGS=all BENCH_RUNS=2 npm run bench:recommend
//   BENCH_CONFIRM=1 BENCH_CONFIGS=A,C BENCH_CASES=allergy,short npm run bench:recommend
//
// BENCH_CONFIRM=1 is required: without it the whole file is skipped and nothing
// is spent, even though the key is loaded from .env.local.
//
// It runs the REAL production path (`generateRecommendations`: same prompt,
// same schema, same parsing and hard-constraint validation) against the same
// representative inputs for each configuration, and counts the actual HTTP
// attempts to Anthropic. It spends real money (one call per case × config ×
// run; Opus is the expensive one) and needs ANTHROPIC_API_KEY in .env.local.
// It writes no database rows and touches no user data.
//
// What it reports per configuration: latency (median / worst), how many
// responses were valid structured output, HTTP attempts (>1 means the SDK
// retried), whether the hard constraints held (the server's own validators PLUS
// an independent literal check of allergens and dietary pattern), and the
// titles — read those to judge quality yourself; there is no automated taste
// score on purpose.

import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findAllergenMentions } from "@/lib/foodTerms";
import { resolveRecommendationInput } from "@/lib/recommend/input";
import { findDietaryViolations, findNoCookViolations, findUnownedApplianceMentions, recipeText } from "@/lib/recommend/textChecks";
import type { CookRecommendation, MealContext, ProfileInput } from "@/lib/types";
import { DEFAULT_PROFILE } from "@/test/profileInput";
import { generateRecommendations, type ModelSettings } from "@/app/api/recommend/claude";

const CONFIGS: Record<string, { label: string; settings: ModelSettings }> = {
  A: { label: "A  opus-5, adaptive thinking, effort high (the old default)", settings: { model: "claude-opus-5", effort: "high", thinking: "adaptive" } },
  B: { label: "B  opus-5, adaptive thinking, effort low", settings: { model: "claude-opus-5", effort: "low", thinking: "adaptive" } },
  C: { label: "C  current default: sonnet-5-5, adaptive thinking, effort low", settings: { model: "claude-sonnet-5-5", effort: "low", thinking: "adaptive" } },
  D: { label: "D  haiku-4-5", settings: { model: "claude-haiku-4-5", effort: "low", thinking: "off" } },
  E: { label: "E  sonnet-5-5, adaptive thinking, effort medium", settings: { model: "claude-sonnet-5-5", effort: "medium", thinking: "adaptive" } },
  F: { label: "F  sonnet-5-5, thinking off, effort low", settings: { model: "claude-sonnet-5-5", effort: "low", thinking: "off" } },
};
const DEFAULT_CONFIGS = "A,B,C,D";

const cook = (o: Partial<MealContext>): MealContext => ({
  decision_mode: "cook",
  cook_minutes: 30,
  hunger: "normal",
  effort: "some",
  shopping: "can_buy",
  craving: null,
  ingredients_on_hand: [],
  budget_override_usd: 12,
  ...o,
});

type Case = { id: string; what: string; profile: ProfileInput; context: MealContext; staples: string[]; noCook?: boolean };
const STAPLES = ["Salt", "Black pepper", "Olive oil", "Soy sauce"];
const CASES: Case[] = [
  { id: "starving", what: "starving + limited ingredients", profile: DEFAULT_PROFILE, staples: STAPLES, context: cook({ hunger: "very_hungry", shopping: "inventory_only", cook_minutes: 20, ingredients_on_hand: ["Eggs", "Rice", "Frozen peas"] }) },
  { id: "inventory", what: "Use what I have", profile: DEFAULT_PROFILE, staples: STAPLES, context: cook({ shopping: "inventory_only", ingredients_on_hand: ["Chicken thighs", "Onion", "Potatoes", "Canned tomatoes"] }) },
  { id: "allergy", what: "allergies (peanut, shellfish) + vegetarian", profile: { ...DEFAULT_PROFILE, allergies: ["peanuts", "shellfish"], dietary_patterns: ["vegetarian"] }, staples: STAPLES, context: cook({}) },
  { id: "short", what: "10 minutes, minimal effort", profile: DEFAULT_PROFILE, staples: STAPLES, context: cook({ cook_minutes: 10, effort: "minimal" }) },
  { id: "protein", what: "high-protein preference", profile: { ...DEFAULT_PROFILE, goal: "muscle_gain", protein_target_g: 150 }, staples: STAPLES, context: cook({ craving: "high protein", hunger: "very_hungry" }) },
  { id: "normal", what: "normal, unrestricted", profile: DEFAULT_PROFILE, staples: STAPLES, context: cook({}) },
  { id: "nocook", what: "No cooking at all (can buy a few things)", profile: { ...DEFAULT_PROFILE, equipment: ["No cooking at all"] }, staples: STAPLES, context: cook({ shopping: "can_buy", effort: "minimal" }), noCook: true },
];

const configEnv = (process.env.BENCH_CONFIGS ?? DEFAULT_CONFIGS).toUpperCase();
const wantConfigs = configEnv === "ALL" ? Object.keys(CONFIGS) : configEnv.split(",");
const wantCases = process.env.BENCH_CASES?.split(",");
const RUNS = Math.max(1, Number(process.env.BENCH_RUNS ?? 1));

type Row = {
  config: string;
  caseId: string;
  ms: number;
  attempts: number;
  ok: boolean;
  code?: string;
  details?: string[];
  titles: string[];
  violations: string[];
  minutes: number[];
  protein: number[];
  inTok: number;
  outTok: number;
  cost: number | null;
};
const rows: Row[] = [];

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : NaN);

describe.skipIf(!process.env.ANTHROPIC_API_KEY || process.env.BENCH_CONFIRM !== "1")("recommend model benchmark", () => {
  for (const key of wantConfigs) {
    const config = CONFIGS[key];
    if (!config) continue;
    it(config.label, async () => {
      for (const c of CASES.filter((x) => !wantCases || wantCases.includes(x.id))) {
        for (let run = 0; run < RUNS; run++) {
          let attempts = 0;
          const client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
            timeout: 90_000,
            maxRetries: 1,
            fetch: (url, init) => {
              attempts++;
              return fetch(url, init);
            },
          });
          const input = resolveRecommendationInput(c.profile, c.context, undefined, c.staples);
          const t0 = performance.now();
          const result = await generateRecommendations(client, input, [], undefined, { settings: config.settings });
          const ms = Math.round(performance.now() - t0);
          const recs = result.ok ? (result.recommendations.filter((r) => r.decision_mode === "cook") as CookRecommendation[]) : [];
          // Independent of the server's validators: a literal allergen / diet check on all the text.
          const violations = recs.flatMap((r) => [
            ...findAllergenMentions(recipeText(r), c.profile.allergies).map((a) => `${r.title}: allergen ${a}`),
            ...findDietaryViolations(recipeText(r), { patterns: c.profile.dietary_patterns, other: c.profile.dietary_other }).map((v) => `${r.title}: ${v}`),
            // No-cook: nothing may call for heat or be a bought hot meal.
            ...(c.noCook ? findNoCookViolations(r).map((v) => `${r.title}: ${v}`) : []),
            ...(c.noCook ? findUnownedApplianceMentions(recipeText(r), []).map((v) => `${r.title}: appliance ${v}`) : []),
          ]);
          if (recs.length > 0 && new Set(recs.map((r) => r.title.toLowerCase())).size < recs.length) violations.push("duplicate titles");
          rows.push({
            config: key,
            caseId: c.id,
            ms,
            attempts,
            ok: result.ok,
            code: result.ok ? undefined : result.code,
            details: result.ok ? undefined : result.details,
            inTok: result.ok ? result.usage.inputTokens : 0,
            outTok: result.ok ? result.usage.outputTokens : 0,
            cost: result.ok ? result.usage.estimatedCostUsd : null,
            titles: recs.map((r) => r.title),
            violations,
            minutes: recs.map((r) => r.estimated_minutes),
            protein: recs.map((r) => r.estimated_protein_g),
          });
          console.log(`${key} ${c.id.padEnd(10)} ${String(ms).padStart(6)} ms  http=${attempts}  ${result.ok ? `valid in=${result.usage.inputTokens} out=${result.usage.outputTokens}` : `INVALID(${result.code}) ${(result.details ?? []).slice(0, 2).join("; ")}`}  ${recs.map((r) => r.title).join(" | ")}`);
        }
      }
      expect(true).toBe(true);
    });
  }

  it("summary", () => {
    const lines: string[] = ["# Recommend model benchmark", "", `Cases: ${[...new Set(rows.map((r) => r.caseId))].join(", ")} · runs per case: ${RUNS}`, ""];
    lines.push(
      "| config | n | valid | median ms | min–max ms | avg HTTP calls | retries | hard-constraint hits | avg in tok | avg out tok | avg cost $ |",
      "|---|---|---|---|---|---|---|---|---|---|---|",
    );
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    for (const key of wantConfigs) {
      const mine = rows.filter((r) => r.config === key);
      if (mine.length === 0) continue;
      const valid = mine.filter((r) => r.ok);
      const costs = valid.map((r) => r.cost).filter((x): x is number => x !== null);
      lines.push(
        `| ${CONFIGS[key].label} | ${mine.length} | ${valid.length}/${mine.length} | ${median(mine.map((r) => r.ms))} | ${Math.min(...mine.map((r) => r.ms))}–${Math.max(...mine.map((r) => r.ms))} | ${avg(mine.map((r) => r.attempts)).toFixed(2)} | ${mine.reduce((n, r) => n + Math.max(0, r.attempts - 1), 0)} | ${mine.reduce((n, r) => n + r.violations.length, 0)} | ${Math.round(avg(valid.map((r) => r.inTok)))} | ${Math.round(avg(valid.map((r) => r.outTok)))} | ${costs.length ? avg(costs).toFixed(4) : "?"} |`,
      );
    }
    lines.push("", "## Per case (read the titles — this is the quality check)", "");
    for (const c of CASES) {
      const here = rows.filter((r) => r.caseId === c.id);
      if (here.length === 0) continue;
      lines.push(`### ${c.id} — ${c.what}`);
      for (const r of here) {
        lines.push(`- **${r.config}** ${r.ms} ms · http ${r.attempts} · ${r.ok ? "valid" : `INVALID ${r.code}${r.details?.length ? ` (${r.details.slice(0, 2).join("; ")})` : ""}`} · out ${r.outTok} tok · ${r.titles.join(" / ") || "—"} · min ${r.minutes.join("/") || "—"} · protein ${r.protein.join("/") || "—"}${r.violations.length ? ` · ⚠ ${r.violations.join("; ")}` : ""}`);
      }
      lines.push("");
    }
    const out = lines.join("\n");
    console.log(`\n${out}`);
    mkdirSync("bench-results", { recursive: true });
    writeFileSync(`bench-results/recommend-${new Date().toISOString().replace(/[:.]/g, "-")}.md`, out);
  });
});
