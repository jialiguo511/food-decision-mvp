// Me, rendered from ProfileData (lib/app/profile.ts) — by the web page on the server and by the iOS
// app on the device.

import Link from "next/link";
import AppShell from "@/components/AppShell";
import SignOutButton from "@/components/SignOutButton";
import type { ProfileData } from "@/lib/app/profile";
import AccountDataSection from "./AccountDataSection";
import KitchenStaplesCard from "./KitchenStaplesCard";
import ProfileForm from "./ProfileForm";
import ProfileGaps from "./ProfileGaps";
import SignInMethods from "./SignInMethods";

export default function ProfileView({ data }: { data: ProfileData }) {
  return (
    <AppShell title="My Food Profile" subtitle="What we always avoid, plus a few things that help us fit you." action={<SignOutButton />}>
      <ProfileGaps gaps={data.gaps} />
      <SignInMethods email={data.email} providers={data.providers} />
      <ProfileForm initial={data.initial} staples={<KitchenStaplesCard initial={data.kitchenStaples} />} allergyStatus={data.allergyStatus} />
      <AccountDataSection usesApple={data.providers.includes("apple")} />
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
