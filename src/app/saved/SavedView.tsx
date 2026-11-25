// Saved, rendered from SavedData (lib/app/saved.ts) — by the web page on the server and by the
// iOS app on the device. Saved is interest only: not "picked", "ate" or "loved".

import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import type { SavedData } from "@/lib/app/saved";
import SavedPlaceCard from "./SavedPlaceCard";
import SavedRecipeCard from "./SavedRecipeCard";

export default function SavedView({ data }: { data: SavedData }) {
  return (
    <>
      <nav className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-line/50 p-1" aria-label="Saved sections">
        {(["recipes", "places"] as const).map((t) => (
          <Link
            key={t}
            href={t === "recipes" ? "/saved" : "/saved?tab=places"}
            aria-current={data.tab === t ? "page" : undefined}
            className={`flex min-h-10 items-center justify-center rounded-xl text-sm font-semibold ${data.tab === t ? "bg-card text-ink shadow-sm" : "text-muted"}`}
          >
            {t === "recipes" ? "Recipes" : "Places"}
          </Link>
        ))}
      </nav>
      {data.tab === "recipes" ? (
        data.recipes.length === 0 ? (
          <EmptyState title="Nothing saved yet" action={{ href: "/today?start=cook", label: "Find something to make" }}>
            Tap the bookmark on a recipe to keep it here.
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {data.recipes.map((item) => (
              <SavedRecipeCard key={item.id} id={item.id} recipe={item.recipe} savedAt={item.savedAt} flags={item.flags} />
            ))}
          </div>
        )
      ) : data.places.length === 0 ? (
        <EmptyState title="Nothing saved yet" action={{ href: "/today?start=order", label: "Find a place nearby" }}>
          Tap the bookmark on a place to keep it here.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {data.places.map(({ place, showGuidance }) => (
            <SavedPlaceCard key={place.place_id} place={place} showGuidance={showGuidance} />
          ))}
          <p className="text-xs text-muted">
            Saved places aren&apos;t re-checked — hours and menus can change. If you have food allergies, check ingredients with the restaurant.
          </p>
        </div>
      )}
    </>
  );
}
