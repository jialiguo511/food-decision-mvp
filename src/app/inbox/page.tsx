import AppShell from "@/components/AppShell";
import ComingNext from "@/components/ComingNext";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";

export default async function InboxPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireUser();

  return (
    <AppShell title="Recipe Inbox" subtitle="Things you want to try.">
      <ComingNext label="Not available yet">
        Paste recipe text, paste a link, or write one down yourself.
      </ComingNext>
    </AppShell>
  );
}
