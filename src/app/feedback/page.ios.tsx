"use client";

// Feedback in the bundled iOS app (the web page checks sign-in on the server; here the write itself
// is refused when signed out).
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import { feedbackPage } from "@/lib/feedback";
import FeedbackForm from "./FeedbackForm";

function Feedback() {
  const from = feedbackPage(useSearchParams().get("from") ?? undefined);
  return (
    <AppShell title="Send feedback" subtitle="Something broken, or something that would help? Tell me.">
      <FeedbackForm page={from} />
    </AppShell>
  );
}

export default function FeedbackScreen() {
  return (
    <Suspense fallback={null}>
      <Feedback />
    </Suspense>
  );
}
