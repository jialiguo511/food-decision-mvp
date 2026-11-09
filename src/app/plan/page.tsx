import { redirect } from "next/navigation";

// Plan is part of the information architecture (CLAUDE.md → "The top-level information
// architecture") but has no contents yet, and the web beta's nav doesn't link it. A page
// that only says "not here yet" is a dead end for anyone who types the URL, so it sends
// them Home. When Plan has contents, replace this redirect with the page (and add the tab
// back to BottomNav.tsx).
export default function PlanPage() {
  redirect("/today");
}
