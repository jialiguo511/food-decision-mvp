// iOS build stand-in for src/app/feedback/actions.ts.
import type * as A from "@/app/feedback/actions";
import { callAction } from "@/ios/callAction";

type R<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;
export const submitFeedback = (...a: Parameters<typeof A.submitFeedback>) => callAction<R<typeof A.submitFeedback>>("submitFeedback", a);
