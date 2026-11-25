// The writes the bundled iOS app may make — an explicit allowlist, not a way to call any server
// function. Each entry is one existing Server Action (the same code the web app runs; each already
// validates its input and acts only on the verified session's user) plus a check of the argument
// SHAPE before it is called. Anything not listed is 404.

import { deleteAccount, resetMyData } from "@/app/profile/account.actions";
import { saveEquipment, saveProfile, setKitchenStaples } from "@/app/profile/actions";
import { removeSaved, saveFromSession, unsaveFromSession } from "@/app/saved/actions";
import {
  chooseRecommendation,
  clearPlaceFeedback,
  completeNutritionStep,
  completeOnboarding,
  confirmNoAllergies,
  dismissNutritionStep,
  recordMealFeedback,
  recordPlaceFeedback,
  rescoreSession,
  setMealFeedbackNote,
} from "@/app/today/actions";
import { trackEvent } from "@/app/today/events.actions";
import { submitFeedback } from "@/app/feedback/actions";

type Check = (value: unknown) => boolean;
const str: Check = (v) => typeof v === "string" && v.length <= 4000;
const int: Check = (v) => Number.isInteger(v);
const bool: Check = (v) => typeof v === "boolean";
const obj: Check = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const strList: Check = (v) => Array.isArray(v) && v.length <= 200 && v.every((x) => typeof x === "string" && x.length <= 200);
const optional = (c: Check): Check => (v) => v === undefined || v === null || c(v);

type Entry = { args: Check[]; run: (...args: never[]) => Promise<unknown>; mutates: boolean };

export const APP_ACTIONS: Record<string, Entry> = {
  chooseRecommendation: { args: [str, int], run: chooseRecommendation, mutates: true },
  recordMealFeedback: { args: [str, str, bool], run: recordMealFeedback, mutates: true },
  setMealFeedbackNote: { args: [str, str], run: setMealFeedbackNote, mutates: true },
  recordPlaceFeedback: { args: [str, str], run: recordPlaceFeedback, mutates: true },
  clearPlaceFeedback: { args: [str], run: clearPlaceFeedback, mutates: true },
  completeOnboarding: { args: [obj, optional(obj)], run: completeOnboarding, mutates: true },
  confirmNoAllergies: { args: [], run: confirmNoAllergies, mutates: true },
  completeNutritionStep: { args: [obj], run: completeNutritionStep, mutates: true },
  dismissNutritionStep: { args: [], run: dismissNutritionStep, mutates: true },
  rescoreSession: { args: [str], run: rescoreSession, mutates: true },
  trackEvent: { args: [obj], run: trackEvent, mutates: false },
  saveFromSession: { args: [str, int], run: saveFromSession, mutates: true },
  unsaveFromSession: { args: [str, int], run: unsaveFromSession, mutates: true },
  removeSaved: { args: [(v) => v === "recipe" || v === "place", str], run: removeSaved, mutates: true },
  saveProfile: { args: [obj], run: saveProfile, mutates: true },
  saveEquipment: { args: [strList], run: saveEquipment, mutates: true },
  setKitchenStaples: { args: [strList], run: setKitchenStaples, mutates: true },
  resetMyData: { args: [], run: resetMyData, mutates: true },
  deleteAccount: { args: [optional(obj)], run: deleteAccount, mutates: true },
  submitFeedback: { args: [obj], run: submitFeedback, mutates: true },
};

/** The args are valid for this action: an array no longer than its parameter list, each one the
 *  right shape (missing trailing optional args are fine). */
export function argsAreValid(entry: Entry, args: unknown): args is unknown[] {
  if (!Array.isArray(args) || args.length > entry.args.length) return false;
  return entry.args.every((check, i) => (i < args.length ? check(args[i]) : check(undefined) || false));
}
