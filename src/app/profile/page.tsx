// Server Component. It runs on the server, reads from Postgres directly, and
// ships only HTML to the browser. No loading spinner, no useEffect, no fetch.

import AppShell from "@/components/AppShell";
import SetupNotice from "@/components/SetupNotice";
import SignOutButton from "@/components/SignOutButton";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PROFILE } from "@/lib/options";
import type { ProfileInput } from "@/lib/types";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const user = await requireUser();
  const supabase = await createClient();

  // maybeSingle() returns null instead of erroring when the row doesn't exist,
  // which is exactly the first-run case.
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // Merge whatever is stored over the defaults, so a brand-new user still
  // gets a fully filled-in form.
  const initial: ProfileInput = {
    ...DEFAULT_PROFILE,
    ...(data
      ? {
          display_name: data.display_name ?? null,
          goal: data.goal,
          protein_target_g: Number(data.protein_target_g),
          daily_calorie_target_kcal:
            data.daily_calorie_target_kcal == null ? null : Number(data.daily_calorie_target_kcal),
          budget_per_meal_usd: Number(data.budget_per_meal_usd),
          fridge_size: data.fridge_size,
          default_cook_minutes: Number(data.default_cook_minutes),
          cuisines: toStringArray(data.cuisines),
          dislikes: toStringArray(data.dislikes),
          equipment: toStringArray(data.equipment),
        }
      : {}),
  };

  return (
    <AppShell
      title="My Food Profile"
      subtitle="Set this once. Every suggestion respects it."
      action={<SignOutButton />}
    >
      <ProfileForm initial={initial} />
    </AppShell>
  );
}

/** JSONB comes back as unknown-shaped JSON; make sure it's string[]. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
