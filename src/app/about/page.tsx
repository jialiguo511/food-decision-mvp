// /about — public (no sign-in). What this beta is, what it stores, what leaves
// it, and how far to trust its numbers. Everything below describes what the code
// does today; if the code changes, this page changes with it. It is not legal
// advice and makes no promise the app doesn't keep in code.

import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { DEFAULT_LIMITS } from "@/lib/usage/limits";

export const metadata: Metadata = { title: "About, privacy and estimates" };

const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-[max(2rem,env(safe-area-inset-top))]">
      <Link href="/today" className="text-sm font-semibold text-accent">
        ← Back
      </Link>
      <h1 className="mt-4 text-[28px] font-semibold leading-tight tracking-tight">About this beta</h1>
      <p className="mt-2 text-muted">
        {BRAND.name} is a small, early web app that helps you decide what to eat right now. It gives you three options at a time, fitted to what you tell it.
        It&apos;s a personal project in a closed beta, so things will change and break.
      </p>

      <Section title="What it is not">
        <p>
          It isn&apos;t a medical or dietetic service, a calorie tracker, or a coach. Nothing here is medical advice. If you have a medical condition, a
          diagnosed allergy, or a specific diet from a professional, follow their guidance over this app&apos;s.
        </p>
      </Section>

      <Section title="Treat the numbers as estimates">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Calories, protein, cost and time are rough estimates made by an AI model — they are shown with a “~” on purpose, and they can be wrong.</li>
          <li>Your daily calorie and protein targets are a standard formula applied to what you enter. They size a meal; they aren&apos;t a prescription.</li>
          <li>Recipes are suggestions. Check cooking times, temperatures and food safety yourself.</li>
          <li>
            For nearby places we have a place&apos;s name, type, distance, price level and whether it&apos;s open — not its menu. “What to look for” is a
            suggestion; the place may not have it.
          </li>
        </ul>
      </Section>

      <Section title="Allergies and foods you avoid">
        <p>
          We tell the AI to leave out what you list, and we run a simple word check on the result. That check is literal — it looks for the exact words you
          entered — so it can miss an alias, a hidden ingredient, or a cross-contact risk.{" "}
          <strong>It is not a safety guarantee.</strong> If an allergy matters for your health, read ingredient lists and ask the restaurant, every time.
        </p>
      </Section>

      <Section title="What we keep">
        <p>Tied to your sign-in email, in our database:</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>Your food profile: allergies, foods you avoid, dietary pattern, goal, kitchen equipment, and any targets or body details you chose to add.</li>
          <li>Your kitchen staples (condiments and seasonings) and your saved recipes and places.</li>
          <li>Each request&apos;s answers, the three options you were shown, which you chose, and whether you ate it — this is how “Last time” works.</li>
          <li>
            A few usage events (which way you started, whether a request worked, how long it took, whether it hit a daily limit). They contain choices and
            numbers only — never what you typed, never foods, health details, or your location.
          </li>
          <li>The food you list as having “right now” is part of that request&apos;s record; it isn&apos;t kept as a pantry or reused for the next meal.</li>
        </ul>
        <p className="mt-2">
          The sentence you type in “Tell me what&apos;s going on” is read once and <strong>not stored</strong> by us. In <em>Me → Account &amp; data</em> you can
          reset your data (everything above, keeping your login) or delete your account.
        </p>
      </Section>

      <Section title="What leaves this app">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Anthropic (the AI model).</strong> To suggest meals we send your food preferences (allergies, foods you avoid, dietary pattern, goal, your
            calorie and protein targets, any nutrition priorities you chose) and the answers for that meal. To read your sentence we send the sentence only. Your
            age, height, weight, and health notes are not sent.
          </li>
          <li>
            <strong>Google Maps Platform (Places).</strong> Only when you ask for places nearby: your approximate location, used for that one search and not
            stored or logged by us. Place photos are fetched from Google.
          </li>
          <li>
            <strong>OpenAI and Pexels (recipe pictures).</strong> A dish name, main ingredients and cooking method — nothing about you. Generated pictures are
            shared between users because they depict a dish, not a person.
          </li>
          <li>
            <strong>Supabase (sign-in and database) and our host.</strong> They store and serve the data above.
          </li>
        </ul>
        <p className="mt-2">
          Each of those services has its own terms and privacy policy. There are no ads and no third-party analytics or tracking scripts in this app; it uses a
          sign-in cookie and nothing else in your browser.
        </p>
      </Section>

      <Section title="Daily limits">
        <p>
          To keep the beta affordable, each person has a daily allowance for the things that cost money — currently up to {DEFAULT_LIMITS.recommend} sets of
          suggestions, {DEFAULT_LIMITS.nearby} nearby searches and {DEFAULT_LIMITS.interpret} typed sentences a day. It resets every day (UTC).
        </p>
      </Section>

      {CONTACT && (
        <Section title="Contact">
          <p>
            Questions, or want your data removed by hand? <a className="font-semibold text-accent underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 text-[15px] leading-relaxed">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
