import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";

/** Use at the top of any signed-in page. Sends people to /login if needed. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
