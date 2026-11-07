// Saved: recipes and places the user wants to come back to. A plain read —
// nothing here calls the model or the places provider — of two user-owned
// tables. Saved is interest only: it is not "picked", "ate" or "loved", and it
// changes no recommendation ranking.

import Link from "next/link";
import AppShell from "@/components/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import SetupNotice from "@/components/SetupNotice";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { PLACE_PROVIDER } from "@/lib/places/feedback";
import { loadPlaceFeedback } from "@/lib/places/feedbackQuery";
import { toProfileInput } from "@/lib/profile";
import { parseSavedPlaceRow, parseSavedRecipe, recipeProfileFlags, savedGuidanceIsAllowed } from "@/lib/saved/saved";
import { createClient } from "@/lib/supabase/server";
import SavedPlaceCard from "./SavedPlaceCard";
import SavedRecipeCard from "./SavedRecipeCard";

type Tab = "recipes" | "places";

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const user = await requireUser();
  const tab: Tab = (await searchParams).tab === "places" ? "places" : "recipes";
  const supabase = await createClient();

  // The CURRENT profile, for re-checking history against. A missing row is a
  // normal state (nothing to conflict with).
  const { data: profileRow } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const profile = toProfileInput(profileRow);

  return (
    <AppShell title="Saved" subtitle="Things you want to come back to.">
      <nav className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-line/50 p-1" aria-label="Saved sections">
        {(["recipes", "places"] as const).map((t) => (
          <Link
            key={t}
            href={t === "recipes" ? "/saved" : "/saved?tab=places"}
            aria-current={tab === t ? "page" : undefined}
            className={`flex min-h-10 items-center justify-center rounded-xl text-sm font-semibold ${
              tab === t ? "bg-card text-ink shadow-sm" : "text-muted"
            }`}
          >
            {t === "recipes" ? "Recipes" : "Places"}
          </Link>
        ))}
      </nav>
      {tab === "recipes" ? await recipes() : await places()}
    </AppShell>
  );

  async function recipes() {
    const { data } = await supabase
      .from("saved_recipes")
      .select("id, recipe, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    const items = (data ?? []).flatMap((row) => {
      const recipe = parseSavedRecipe(row.recipe);
      return recipe && typeof row.id === "string" ? [{ id: row.id, recipe, savedAt: typeof row.created_at === "string" ? row.created_at : null }] : [];
    });
    if (items.length === 0) return <Empty action={{ href: "/today", label: "Find something to make" }}>Tap the bookmark on a recipe to keep it here.</Empty>;
    return (
      <div className="space-y-4">
        {items.map((item) => (
          <SavedRecipeCard key={item.id} {...item} flags={recipeProfileFlags(item.recipe, profile)} />
        ))}
      </div>
    );
  }

  async function places() {
    const { data } = await supabase
      .from("saved_places")
      .select("place_id, name, address, category, maps_url, website_url, look_for, created_at")
      .eq("user_id", user.id)
      .eq("provider", PLACE_PROVIDER)
      .order("created_at", { ascending: false })
      .limit(200);
    // A place the user said "never again" to is not shown, even if a stale
    // row is still there (the exclusion already removes it; this is the
    // guarantee if that removal ever failed).
    const { excluded } = await loadPlaceFeedback(supabase, user.id);
    const items = (data ?? []).flatMap((row) => {
      const place = parseSavedPlaceRow(row);
      return place && !excluded.has(place.place_id) ? [place] : [];
    });
    if (items.length === 0) return <Empty action={{ href: "/today", label: "Find a place nearby" }}>Tap the bookmark on a place to keep it here.</Empty>;
    return (
      <div className="space-y-4">
        {items.map((place) => (
          <SavedPlaceCard key={place.place_id} place={place} showGuidance={savedGuidanceIsAllowed(place.look_for, profile.allergies)} />
        ))}
        <p className="text-xs text-muted">
          Saved places aren&apos;t re-checked — hours and menus can change. If you have food allergies, check ingredients with the
          restaurant.
        </p>
      </div>
    );
  }
}

function Empty({ children, action }: { children: React.ReactNode; action: { href: string; label: string } }) {
  return (
    <EmptyState title="Nothing saved yet" action={action}>
      {children}
    </EmptyState>
  );
}
