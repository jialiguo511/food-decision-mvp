"use client";

// Home in the bundled iOS app: the same HomeFlow the web renders, with its props from
// GET /api/app/home (lib/app/home.ts — the same loader the web page uses).
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import type { HomeProps } from "@/lib/app/home";
import ScreenState from "@/ios/ScreenState";
import { useAppData } from "@/ios/useAppData";
import HomeFlow from "./HomeFlow";

function Home() {
  const start = useSearchParams().get("start");
  const { state, retry } = useAppData<HomeProps>(`/api/app/home${start ? `?start=${encodeURIComponent(start)}` : ""}`);
  return <AppShell>{state.status === "ready" ? <HomeFlow {...state.data} /> : <ScreenState state={state} onRetry={retry} />}</AppShell>;
}

export default function TodayScreen() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}
