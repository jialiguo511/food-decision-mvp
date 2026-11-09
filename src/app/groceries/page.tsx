import { redirect } from "next/navigation";

// Same as /plan: an empty placeholder, unlinked in the web beta, so it goes Home instead of
// showing a "coming soon" page. Restore the real page (and the nav tab) when Groceries has contents.
export default function GroceriesPage() {
  redirect("/today");
}
