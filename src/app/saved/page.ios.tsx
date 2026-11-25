"use client";

// Saved in the bundled iOS app — SavedView with data from GET /api/app/saved; re-read after a remove.
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import { parseSavedTab, type SavedData } from "@/lib/app/savedTypes";
import ScreenState from "@/ios/ScreenState";
import { useAppData } from "@/ios/useAppData";
import SavedView from "./SavedView";

function Saved() {
  const tab = parseSavedTab(useSearchParams().get("tab"));
  const { state, retry } = useAppData<SavedData>(`/api/app/saved?tab=${tab}`, { refetchOnChange: true });
  return (
    <AppShell title="Saved" subtitle="Things you want to come back to.">
      {state.status === "ready" ? <SavedView data={state.data} /> : <ScreenState state={state} onRetry={retry} />}
    </AppShell>
  );
}

export default function SavedScreen() {
  return (
    <Suspense fallback={null}>
      <Saved />
    </Suspense>
  );
}
