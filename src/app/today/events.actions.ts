"use server";

// The browser's way to note the two events only it can see: which way in the
// person chose, and that a sentence needed a follow-up. Everything else
// (recommend_done, choice_made, interpret_done, limit_hit) is written by the
// server where it happens. The shape is validated here, and again by the
// database; a signed-out call or a bad event is simply dropped — events are
// notes, never part of the loop.

import { recordEvent } from "@/lib/events/record";
import { clientEventSchema } from "@/lib/events/schema";
import { createClient } from "@/lib/supabase/server";

export async function trackEvent(event: unknown): Promise<void> {
  const parsed = clientEventSchema.safeParse(event);
  if (!parsed.success) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await recordEvent(supabase, user.id, parsed.data);
}
