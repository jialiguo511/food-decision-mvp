import type { CookRecommendation } from "@/lib/types";
import RecipeImage from "../today/RecipeImage";
import RemoveSaved from "./RemoveSaved";

/** A saved recipe, rebuilt from the stored recommendation — never regenerated.
 *  `flags` are what it now runs into in the user's CURRENT profile; the recipe
 *  is shown unchanged either way, and is never presented as currently suitable
 *  when an allergy matches. */
export default function SavedRecipeCard({
  id,
  recipe,
  savedAt,
  flags,
}: {
  id: string;
  recipe: CookRecommendation;
  savedAt: string | null;
  flags: { allergies: string[]; dislikes: string[] };
}) {
  const ingredients = [...new Set([...recipe.ingredients_on_hand, ...recipe.ingredients_needed])];
  return (
    <article className="rounded-3xl border border-line bg-card p-4 shadow-[0_1px_3px_rgba(42,37,32,0.06)]">
      <RecipeImage target={{ saved_id: id }} size="thumbnail" />
      <h3 className="text-lg font-semibold leading-snug">{recipe.title}</h3>
      <p className="mt-1 text-sm text-muted">
        ~{recipe.estimated_minutes} min · ~{recipe.estimated_calories} cal · ~{recipe.estimated_protein_g}g protein
      </p>

      {flags.allergies.length > 0 && (
        <p role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          May not match your current profile: mentions {flags.allergies.join(", ").toLowerCase()}, which you&apos;ve listed as an
          allergy.
        </p>
      )}
      {flags.allergies.length === 0 && flags.dislikes.length > 0 && (
        <p className="mt-2 text-xs text-muted">May no longer fit your preferences: mentions {flags.dislikes.join(", ").toLowerCase()}.</p>
      )}

      <p className="mt-2 line-clamp-2 text-sm text-ink/90">{recipe.reason}</p>
      <details className="group mt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-2xl border border-line text-sm font-semibold text-accent">
          <span className="group-open:hidden">View recipe</span>
          <span className="hidden group-open:inline">Hide recipe</span>
        </summary>
        <p className="mt-3 text-sm">
          <span className="text-muted">Ingredients:</span> {ingredients.join(", ") || "—"}
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          {recipe.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </details>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
        <span>{savedAt ? `Saved ${new Date(savedAt).toLocaleDateString()}` : "Saved"}</span>
        <RemoveSaved kind="recipe" id={id} />
      </div>
    </article>
  );
}
