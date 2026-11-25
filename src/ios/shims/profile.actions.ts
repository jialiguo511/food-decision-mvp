// iOS build stand-in for src/app/profile/actions.ts.
import type * as A from "@/app/profile/actions";
import { callAction } from "@/ios/callAction";

type R<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;
export const saveProfile = (...a: Parameters<typeof A.saveProfile>) => callAction<R<typeof A.saveProfile>>("saveProfile", a);
export const saveEquipment = (...a: Parameters<typeof A.saveEquipment>) => callAction<R<typeof A.saveEquipment>>("saveEquipment", a);
export const setKitchenStaples = (...a: Parameters<typeof A.setKitchenStaples>) => callAction<R<typeof A.setKitchenStaples>>("setKitchenStaples", a);
