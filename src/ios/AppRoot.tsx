"use client";

// The bundled app's root: installs the fetch bridge before any screen fetches, and shows "Update
// required" when this version is older than the backend serves (checked at launch and on any 426).
import { useEffect, useState } from "react";
import { versionLessThan } from "@/lib/appOrigin";
import { BRAND } from "@/lib/brand";
import { APP_VERSION, UPDATE_REQUIRED } from "./config";
import { installFetchBridge } from "./fetchBridge";

installFetchBridge();

export default function AppRoot({ children }: { children: React.ReactNode }) {
  const [updateRequired, setUpdateRequired] = useState(false);

  useEffect(() => {
    const onRequired = () => setUpdateRequired(true);
    window.addEventListener(UPDATE_REQUIRED, onRequired);
    void fetch("/api/app/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { minVersion?: unknown } | null) => {
        if (typeof c?.minVersion === "string" && versionLessThan(APP_VERSION, c.minVersion)) setUpdateRequired(true);
      })
      .catch(() => undefined); // offline at launch: the screens say so; the check runs again next launch
    return () => window.removeEventListener(UPDATE_REQUIRED, onRequired);
  }, []);

  if (updateRequired) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Update required</h1>
        <p className="text-muted">
          This version of {BRAND.short} is no longer supported. Update it from the App Store (or TestFlight) to keep getting suggestions.
        </p>
        <p className="text-xs text-muted">Your profile and saved meals are kept.</p>
      </main>
    );
  }
  return <>{children}</>;
}
