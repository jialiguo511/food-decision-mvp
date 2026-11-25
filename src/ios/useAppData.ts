"use client";

// A bundled screen's server data (GET /api/app/…): loading, ready, signed out (→ sign-in), offline
// or failed (→ a retry), and a quiet re-read after any write the app makes.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DATA_CHANGED } from "./config";

export type AppData<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "offline" } | { status: "error" };

export function useAppData<T>(path: string, { refetchOnChange = false }: { refetchOnChange?: boolean } = {}) {
  const router = useRouter();
  const [state, setState] = useState<AppData<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    void (async () => {
      let response: Response;
      try {
        response = await fetch(path);
      } catch {
        if (live) setState((s) => (s.status === "ready" ? s : { status: "offline" }));
        return;
      }
      if (!live) return;
      if (response.status === 401) return router.replace("/login");
      if (!response.ok) return setState((s) => (s.status === "ready" ? s : { status: "error" }));
      const data = (await response.json().catch(() => null)) as T | null;
      setState(data === null ? { status: "error" } : { status: "ready", data });
    })();
    return () => {
      live = false;
    };
  }, [path, attempt, router]);

  useEffect(() => {
    if (!refetchOnChange) return;
    window.addEventListener(DATA_CHANGED, retry);
    return () => window.removeEventListener(DATA_CHANGED, retry);
  }, [refetchOnChange, retry]);

  return { state, retry };
}
