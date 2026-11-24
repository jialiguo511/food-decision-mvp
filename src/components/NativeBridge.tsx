"use client";

// The iOS app's small native layer, mounted once in the root layout. In a normal browser it does
// nothing. Inside the app (docs/IOS_RELEASE.md):
//   - links to other sites, maps, mail and phone open outside the WebView (Safari view / system),
//     so the person always has a way back to the app;
//   - coming back after a long time away reloads the page (fresh session, fresh Home);
//   - the native launch screen is hidden once the first page has painted;
//   - an opened sign-in link (Universal Link) is loaded in the app.

import { useEffect } from "react";
import { isExternalHref, isNativeApp, shouldReloadOnResume } from "@/lib/native";

export default function NativeBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add("native-app");
    let hiddenAt: number | null = null;
    const cleanups: Array<() => void> = [];

    void import("@capacitor/splash-screen").then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 200 })).catch(() => {});

    async function openOutside(href: string) {
      const url = new URL(href, window.location.origin).toString();
      if (/^https?:/.test(url)) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url, presentationStyle: "popover" });
      } else {
        // mailto:/tel:/sms: — iOS hands these to the right app.
        window.location.href = url;
      }
    }

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!isExternalHref(href, window.location.origin)) return;
      event.preventDefault();
      void openOutside(href);
    };
    document.addEventListener("click", onClick, true);
    cleanups.push(() => document.removeEventListener("click", onClick, true));

    void import("@capacitor/app").then(async ({ App }) => {
      const state = await App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) {
          hiddenAt = Date.now();
          return;
        }
        if (shouldReloadOnResume(hiddenAt, Date.now())) window.location.reload();
        hiddenAt = null;
      });
      const opened = await App.addListener("appUrlOpen", ({ url }) => {
        // Only our own pages; anything else is ignored.
        try {
          const target = new URL(url);
          if (target.origin === window.location.origin) window.location.assign(target.pathname + target.search + target.hash);
        } catch {
          /* not a URL we handle */
        }
      });
      cleanups.push(() => void state.remove(), () => void opened.remove());
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);
  return null;
}
