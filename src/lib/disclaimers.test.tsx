// @vitest-environment jsdom
//
// The release-safety copy: where it appears, that it states limits (never a guarantee),
// and that the sign-in check keeps its secret server-side. Wording lives in lib/disclaimers.ts.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AboutPage from "@/app/about/page";
import { ACCURACY_NOTE, ALLERGY_NOTE, MEDICAL_NOTE } from "./disclaimers";

const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

describe("disclaimer wording", () => {
  it("states limits, never a guarantee", () => {
    for (const text of [ALLERGY_NOTE, MEDICAL_NOTE, ACCURACY_NOTE]) {
      expect(text).not.toMatch(/guarantee[sd]?\b(?!.*not)|allergen[- ]free|\bsafe for\b|never suggested/i);
    }
    expect(ALLERGY_NOTE).toMatch(/check ingredients, labels and cross-contact/i);
    expect(ALLERGY_NOTE).toMatch(/can miss allergens/i);
    expect(MEDICAL_NOTE).toMatch(/not medical advice, diagnosis or treatment/i);
    expect(MEDICAL_NOTE).toMatch(/healthcare professional/i);
  });
});

describe("/about", () => {
  const page = plain(renderToStaticMarkup(<AboutPage />));
  it("carries the medical, accuracy and allergy disclosures", () => {
    expect(page).toContain(MEDICAL_NOTE.replace(/\s+/g, " "));
    expect(page).toContain(ACCURACY_NOTE);
    expect(page).toContain(ALLERGY_NOTE);
    expect(page).toContain("It is not a safety guarantee.");
  });
  it("lists what is kept, what leaves, and how to delete", () => {
    expect(page).toMatch(/What we keep/);
    expect(page).toMatch(/What leaves this app/);
    expect(page).toMatch(/Anthropic/);
    expect(page).toMatch(/Google Maps Platform/);
    expect(page).toMatch(/delete your account/);
  });
});

describe("where the allergy note is shown", () => {
  it("at the allergy question, in Me, and once under the results cards", () => {
    expect(src("app/today/onboarding/Onboarding.tsx")).toMatch(/ALLERGY_LEAD[\s\S]*ALLERGY_REST/);
    expect(src("app/profile/ProfileForm.tsx")).toMatch(/hint=\{`[^`]*\$\{ALLERGY_NOTE\}`\}/);
    const results = src("app/today/results/ResultsScreen.tsx");
    expect(results.match(/ALLERGY_REST/g)?.length).toBe(2); // one import, one use: a single footnote
    for (const card of ["RecipeCard", "PlaceCard", "IdeaCard", "ResultCard"]) {
      expect(src(`app/today/results/${card}.tsx`)).not.toMatch(/ALLERGY_|MEDICAL_NOTE/);
    }
  });
  it("the medical disclaimer is not repeated in the flow", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.test\./.test(name) && /MEDICAL_NOTE/.test(readFileSync(p, "utf8"))) hits.push(p.replace(process.cwd() + "/", ""));
      }
    };
    walk(join(process.cwd(), "src"));
    expect(hits.sort()).toEqual(["src/app/about/page.tsx", "src/lib/disclaimers.ts"]);
  });
});

describe("sign-in check (Turnstile)", () => {
  it("passes the token to Supabase and never references a secret key", () => {
    expect(src("app/login/page.tsx")).toMatch(/captchaToken: captcha/);
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
      });
    for (const file of walk(join(process.cwd(), "src"))) {
      const text = readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
      expect(text, file).not.toMatch(/TURNSTILE_SECRET|NEXT_PUBLIC_TURNSTILE_SECRET/i);
    }
  });
});
