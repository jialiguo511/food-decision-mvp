// What Me shows for one signed-in user — shared by the web page and the iOS app (GET
// /api/app/profile). Plain reads; raw stored values (manual targets stay null when unset).

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { allergyStatus, type AllergyStatus } from "@/lib/allergyStatus";
import { toProfileFormValues } from "@/lib/profile";
import { profileGaps, type ProfileGap } from "@/lib/profileCompletion";
import type { ProfileFormValues } from "@/lib/types";

export type ProfileData = {
  initial: ProfileFormValues;
  kitchenStaples: string[];
  allergyStatus: AllergyStatus;
  gaps: ProfileGap[];
  email: string | null;
  providers: string[];
};

export async function loadProfile(supabase: SupabaseClient, user: Pick<User, "id" | "email" | "identities" | "app_metadata">): Promise<ProfileData> {
  // maybeSingle() returns null instead of erroring when the row doesn't exist (first run).
  const [{ data }, { data: staplesRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("kitchen_staples").select("name").eq("user_id", user.id).order("created_at", { ascending: true }),
  ]);
  const kitchenStaples = (staplesRows ?? []).map((row) => row.name as string);
  return {
    initial: toProfileFormValues(data),
    kitchenStaples,
    allergyStatus: allergyStatus(data),
    gaps: profileGaps(data, kitchenStaples.length),
    email: user.email ?? null,
    providers: providersOf(user),
  };
}

/** How this account can sign in ("email", "apple"), from the verified user. */
export function providersOf(user: { identities?: { provider: string }[] | null; app_metadata?: { providers?: unknown } }): string[] {
  const fromIdentities = (user.identities ?? []).map((i) => i.provider);
  const meta = user.app_metadata?.providers;
  return [...new Set([...fromIdentities, ...(Array.isArray(meta) ? meta.filter((p): p is string => typeof p === "string") : [])])];
}
