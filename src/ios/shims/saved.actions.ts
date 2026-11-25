// iOS build stand-in for src/app/saved/actions.ts.
import type * as A from "@/app/saved/actions";
import { callAction } from "@/ios/callAction";

type R<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;
export const saveFromSession = (...a: Parameters<typeof A.saveFromSession>) => callAction<R<typeof A.saveFromSession>>("saveFromSession", a);
export const unsaveFromSession = (...a: Parameters<typeof A.unsaveFromSession>) => callAction<R<typeof A.unsaveFromSession>>("unsaveFromSession", a);
export const removeSaved = (...a: Parameters<typeof A.removeSaved>) => callAction<R<typeof A.removeSaved>>("removeSaved", a);
