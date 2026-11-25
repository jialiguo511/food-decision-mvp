// iOS build stand-in for src/app/today/actions.ts (same exports; see next.config.ts).
import type * as A from "@/app/today/actions";
import { callAction } from "@/ios/callAction";

type R<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;
export const chooseRecommendation = (...a: Parameters<typeof A.chooseRecommendation>) => callAction<R<typeof A.chooseRecommendation>>("chooseRecommendation", a);
export const recordMealFeedback = (...a: Parameters<typeof A.recordMealFeedback>) => callAction<R<typeof A.recordMealFeedback>>("recordMealFeedback", a);
export const setMealFeedbackNote = (...a: Parameters<typeof A.setMealFeedbackNote>) => callAction<R<typeof A.setMealFeedbackNote>>("setMealFeedbackNote", a);
export const recordPlaceFeedback = (...a: Parameters<typeof A.recordPlaceFeedback>) => callAction<R<typeof A.recordPlaceFeedback>>("recordPlaceFeedback", a);
export const clearPlaceFeedback = (...a: Parameters<typeof A.clearPlaceFeedback>) => callAction<R<typeof A.clearPlaceFeedback>>("clearPlaceFeedback", a);
export const completeOnboarding = (...a: Parameters<typeof A.completeOnboarding>) => callAction<R<typeof A.completeOnboarding>>("completeOnboarding", a);
export const confirmNoAllergies = () => callAction<R<typeof A.confirmNoAllergies>>("confirmNoAllergies", []);
export const completeNutritionStep = (...a: Parameters<typeof A.completeNutritionStep>) => callAction<R<typeof A.completeNutritionStep>>("completeNutritionStep", a);
export const dismissNutritionStep = () => callAction<R<typeof A.dismissNutritionStep>>("dismissNutritionStep", []);
export const rescoreSession = (...a: Parameters<typeof A.rescoreSession>) => callAction<R<typeof A.rescoreSession>>("rescoreSession", a);
