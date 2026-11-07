// Writing one event. Fire-and-forget by design: an event is a note about the
// decision loop, never part of it — it must not slow a request down, fail one,
// or throw. Anything wrong (bad shape, table missing because the migration
// hasn't run, a database hiccup) is dropped with a one-line warning that names
// the problem and carries no content.

import type { SupabaseClient } from "@supabase/supabase-js";
import { eventSchema, type ProductEvent } from "./schema";

type Insertable = { from: SupabaseClient["from"] };

export async function recordEvent(supabase: Insertable, userId: string, event: ProductEvent): Promise<void> {
  try {
    const parsed = eventSchema.safeParse(event);
    if (!parsed.success) {
      console.warn("[events] dropped an event that doesn't match its shape", { name: event?.name });
      return;
    }
    const { error } = await supabase.from("product_events").insert({ user_id: userId, name: parsed.data.name, props: parsed.data.props });
    if (error) console.warn("[events] couldn't record an event", { name: parsed.data.name, code: error.code });
  } catch (failure) {
    console.warn("[events] event write threw", { error: failure instanceof Error ? failure.name : "unknown" });
  }
}
