// iOS build stand-in for src/app/profile/account.actions.ts.
import type * as A from "@/app/profile/account.actions";
import { callAction } from "@/ios/callAction";

type R<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;
export const resetMyData = () => callAction<R<typeof A.resetMyData>>("resetMyData", []);
export const deleteAccount = (...a: Parameters<typeof A.deleteAccount>) => callAction<R<typeof A.deleteAccount>>("deleteAccount", a);
