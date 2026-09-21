// Small text helpers shared by the cook and order flows.

/**
 * Tidy a typed craving: drop surrounding whitespace and collapse runs of it.
 * Only ever called when the value is finalized — on blur, and when the
 * context is captured. Never on keystroke, or a typed value with a trailing
 * space could never grow past one word.
 */
export function normalizeCraving(value: string): string | null {
  return value.trim().replace(/\s+/g, " ") || null;
}
