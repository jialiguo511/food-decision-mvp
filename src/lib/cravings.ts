// Several compatible cravings at once ("Light and clean" + "Vegetarian"), as users asked. A Cook
// craving is still ONE text field (the prompt reads it as the person's words), so the chips and any
// typed words are joined into it and read back out of it — no schema change, old sessions read fine.
//
// Some choices can't sensibly go together; picking one drops the other (`EXCLUSIVE`). "No
// preference" is not a chip in the list: it is the empty selection.

const SEPARATOR = ", ";

/** Pairs/groups where picking one removes the others. */
export const COOK_CRAVING_EXCLUSIVE: readonly (readonly string[])[] = [["Light and clean", "Comfort food"]];

export function splitCraving(craving: string | null, presets: readonly string[]): { chips: string[]; custom: string } {
  if (!craving) return { chips: [], custom: "" };
  const parts = craving.split(SEPARATOR);
  const chips = parts.filter((p) => presets.includes(p));
  const custom = parts.filter((p) => !presets.includes(p)).join(SEPARATOR);
  return { chips, custom };
}

export function joinCraving(chips: readonly string[], custom: string): string | null {
  const words = custom.trim().replace(/\s+/g, " ");
  const all = [...chips, ...(words ? [words] : [])];
  return all.length ? all.join(SEPARATOR) : null;
}

/** Toggle one option, keeping the order picked and dropping anything it can't go with. */
export function toggleCompatible<T extends string>(selected: readonly T[], option: T, exclusive: readonly (readonly T[])[]): T[] {
  if (selected.includes(option)) return selected.filter((s) => s !== option);
  const clashes = new Set(exclusive.filter((group) => group.includes(option)).flat().filter((o) => o !== option));
  return [...selected.filter((s) => !clashes.has(s)), option];
}
