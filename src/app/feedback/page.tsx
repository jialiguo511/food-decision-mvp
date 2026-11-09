// /feedback — a short form. Signed-in only (it is rate-limited per person).

import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { feedbackPage } from "@/lib/feedback";
import FeedbackForm from "./FeedbackForm";

export const metadata: Metadata = { title: "Send feedback" };

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireUser();
  const from = feedbackPage((await searchParams).from);
  return (
    <AppShell title="Send feedback" subtitle="Something broken, or something that would help? Tell me.">
      <FeedbackForm page={from} />
    </AppShell>
  );
}
