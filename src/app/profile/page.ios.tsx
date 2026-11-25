"use client";

// Me in the bundled iOS app — ProfileView with data from GET /api/app/profile.
import AppShell from "@/components/AppShell";
import type { ProfileData } from "@/lib/app/profile";
import ScreenState from "@/ios/ScreenState";
import { useAppData } from "@/ios/useAppData";
import ProfileView from "./ProfileView";

export default function ProfileScreen() {
  const { state, retry } = useAppData<ProfileData>("/api/app/profile", { refetchOnChange: true });
  if (state.status === "ready") return <ProfileView data={state.data} />;
  return (
    <AppShell title="My Food Profile">
      <ScreenState state={state} onRetry={retry} />
    </AppShell>
  );
}
