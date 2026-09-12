import AppShell from "@/components/AppShell";
import ComingNext from "@/components/ComingNext";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";

export default async function ResultsPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireUser();

  return (
    <AppShell title="Your three options" subtitle="Pick one. That's the whole job.">
      <ComingNext label="Coming next">
        Best match, lowest effort, and one useful alternative — then we ask
        whether you actually ate it.
      </ComingNext>
    </AppShell>
  );
}
