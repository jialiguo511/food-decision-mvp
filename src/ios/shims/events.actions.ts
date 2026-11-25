// iOS build stand-in for src/app/today/events.actions.ts.
import { callAction } from "@/ios/callAction";

export async function trackEvent(event: unknown): Promise<void> {
  await callAction<null>("trackEvent", [event], { mutates: false });
}
