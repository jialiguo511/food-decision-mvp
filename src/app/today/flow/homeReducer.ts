// Which screen Home is on. Only navigation lives here — the request, the
// active session and the selection stay in useRecommend, and the answers stay
// in HomeFlow's per-mode form state — so a screen change can never send a
// request or lose an answer.
//
//   onboarding → start ─┬→ mode(mode) ──"Edit"──┐   (mode already used)
//                       └→ questions(mode, step)─┴─ last ──→ results ⇄ nutrition
//
// A mode the user has used before opens on `mode`: its last answers as one
// quiet line, with the single button that acts on them. A mode they haven't
// goes straight to its first question. "results" covers generating, errors, the
// three cards and the chosen state; which of those shows is derived from
// useRecommend, not stored here.

import type { DecisionMode } from "@/lib/types";

export type Screen =
  | { name: "onboarding" }
  | { name: "start" }
  | { name: "mode"; mode: DecisionMode }
  /** "What can you cook with?" — asked before the first Cook, once. */
  | { name: "equipment" }
  /** `viaMode`: the questions were opened from the mode's own screen, so Back
   *  from the first one returns there rather than to Start. */
  | { name: "questions"; mode: DecisionMode; step: number; viaMode: boolean }
  | { name: "results" }
  /** The optional "better portion and protein suggestions" step. */
  | { name: "nutrition" };

export type HomeAction =
  /** Onboarding finished or skipped. */
  | { type: "onboarded" }
  /** A mode on Start. `hasMemory` = the user has used this mode before. */
  | { type: "pickMode"; mode: DecisionMode; hasMemory: boolean }
  /** "Edit" / "Change" — answer the questions for this mode. From the first
   *  one, or from `step` (e.g. straight to "What do you have right now?"). */
  | { type: "customize"; mode: DecisionMode; step?: number }
  /** Cook needs the kitchen equipment answer first. */
  | { type: "askEquipment" }
  /** Next question. `stepCount` is the current list's length (it can change
   *  with the answers); never moves past the last question — that one ends in
   *  an explicit button, which dispatches "showResults" instead. `from` is the
   *  question the move was made on: a move from a question the screen has
   *  already left (an auto-advance racing a Back or a Continue) is ignored. */
  | { type: "next"; stepCount: number; from: number }
  | { type: "back" }
  | { type: "showResults" }
  | { type: "openNutrition" }
  | { type: "nutritionDone" }
  | { type: "start" };

export function initialScreen({ hasSession, needsOnboarding }: { hasSession: boolean; needsOnboarding: boolean }): Screen {
  if (hasSession) return { name: "results" };
  if (needsOnboarding) return { name: "onboarding" };
  return { name: "start" };
}

export function homeReducer(screen: Screen, action: HomeAction): Screen {
  switch (action.type) {
    case "onboarded":
    case "start":
      return { name: "start" };
    case "pickMode":
      return action.hasMemory
        ? { name: "mode", mode: action.mode }
        : { name: "questions", mode: action.mode, step: 0, viaMode: false };
    case "customize":
      return { name: "questions", mode: action.mode, step: action.step ?? 0, viaMode: true };
    case "askEquipment":
      return { name: "equipment" };
    case "next":
      if (screen.name !== "questions" || screen.step !== action.from) return screen;
      return { ...screen, step: Math.min(screen.step + 1, Math.max(action.stepCount - 1, 0)) };
    case "back":
      if (screen.name === "questions") {
        if (screen.step > 0) return { ...screen, step: screen.step - 1 };
        return screen.viaMode ? { name: "mode", mode: screen.mode } : { name: "start" };
      }
      if (screen.name === "nutrition") return { name: "results" };
      return { name: "start" };
    case "showResults":
    case "nutritionDone":
      return { name: "results" };
    case "openNutrition":
      return { name: "nutrition" };
  }
}

/** Which mode "Change" should reopen. The session on screen wins; with no
 *  session (the first request failed) it's the mode that was just requested,
 *  so a failed Eat out request doesn't send you into the Cook questions. */
export function modeToChange(sessionMode: DecisionMode | null, lastRequestedMode: DecisionMode | null): DecisionMode {
  return sessionMode ?? lastRequestedMode ?? "cook";
}
