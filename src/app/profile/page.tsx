// Server Component. It runs on the server, reads from Postgres directly, and
// ships only HTML to the browser. No loading spinner, no useEffect, no fetch.

import Link from "next/link";
import AppShell from "@/components/AppShell";
import SetupNotice from "@/components/SetupNotice";
import SignOutButton from "@/components/SignOutButton";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { allergyStatus } from "@/lib/allergyStatus";
import { toProfileFormValues } from "@/lib/profile";
import AccountDataSection from "./AccountDataSection";
import KitchenStaplesCard from "./KitchenStaplesCard";
import ProfileForm from "./ProfileForm";
import ProfileGaps from "./ProfileGaps";
import SignInMethods from "./SignInMethods";
import { profileGaps } from "@/lib/profileCompletion";

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

  // Raw stored values (manual targets stay null when unset, so the form can
  // show the calculated suggestion). A brand-new user — or an old row with no
  // Profile v2 columns — still gets a fully filled-in, valid form.
  const initial = toProfileFormValues(data);

  const { data: staplesRows } = await supabase
    .from("kitchen_staples")
    .select("name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const kitchenStaples = (staplesRows ?? []).map((row) => row.name as string);

  return (
    <AppShell
      title="My Food Profile"
      subtitle="What we always avoid, plus a few things that help us fit you."
      action={<SignOutButton />}
    >
      <ProfileGaps gaps={profileGaps(data, kitchenStaples.length)} />
      <SignInMethods email={user.email ?? null} providers={providersOf(user)} />
      <ProfileForm initial={initial} staples={<KitchenStaplesCard initial={kitchenStaples} />} allergyStatus={allergyStatus(data)} />
      <AccountDataSection usesApple={providersOf(user).includes("apple")} />
      <p className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-muted">
        <Link href="/feedback?from=/profile" className="text-sm font-semibold text-accent">
          Send feedback or report a problem
        </Link>
        <Link href="/about" className="underline">
          About this beta, privacy and estimates
        </Link>
      </p>
    </AppShell>
  );
}

/** How this account can sign in ("email", "apple"), from the verified user. */
function providersOf(user: { identities?: { provider: string }[] | null; app_metadata?: { providers?: unknown } }): string[] {
  const fromIdentities = (user.identities ?? []).map((i) => i.provider);
  const meta = user.app_metadata?.providers;
  return [...new Set([...fromIdentities, ...(Array.isArray(meta) ? meta.filter((p): p is string => typeof p === "string") : [])])];
}
