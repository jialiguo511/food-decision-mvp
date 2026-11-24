// What the page needs to know about running inside the iOS app (Capacitor). Everything here is a
// no-op in a normal browser: the Capacitor bridge only exists inside the app's WebView.

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** A link that should leave the app: another site, a maps app, mail or phone. Same-origin links
 *  stay in the WebView. */
export function isExternalHref(href: string, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return false;
  }
  if (url.protocol === "mailto:" || url.protocol === "tel:" || url.protocol === "sms:") return true;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.origin !== origin;
}

/** After this long in the background the page reloads on return, so the middleware refreshes the
 *  session and Home re-reads the latest state instead of showing a stale screen. A request that was
 *  in flight is not lost: its result is stored server-side and restored by Home. */
export const RESUME_RELOAD_AFTER_MS = 30 * 60 * 1000;

export function shouldReloadOnResume(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= RESUME_RELOAD_AFTER_MS;
}

/** A light tap on the main choices. Silent if haptics aren't available. */
export async function tapFeedback(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Haptics are a nicety; never let them break a tap.
  }
}
