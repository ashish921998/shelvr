export const FREE_SAVES_NUDGE_AT = 2;

export type FreeSaves = {
  limit: number;
  used: number;
  left: number;
  pending: number;
  open: boolean;
};

export type Access =
  | { kind: "signedOut" }
  | { kind: "loading" }
  | { kind: "pro"; syncing: boolean }
  | ({ kind: "free" } & FreeSaves)
  | { kind: "locked" };

export function accessOf({
  signedIn,
  entitlement,
  awaitingPurchase,
  freeSaves,
}: {
  signedIn: boolean;
  entitlement: { entitled: boolean; loading: boolean };
  awaitingPurchase: boolean;
  freeSaves: FreeSaves | null | undefined;
}): Access {
  if (!signedIn) return { kind: "signedOut" };
  if (entitlement.entitled || awaitingPurchase)
    return { kind: "pro", syncing: !entitlement.entitled };
  if (entitlement.loading || freeSaves === undefined)
    return { kind: "loading" };
  if (freeSaves === null) return { kind: "locked" };
  return { kind: "free", ...freeSaves };
}

export function canBrowse(access: Access): boolean {
  return access.kind === "pro" || access.kind === "free";
}

export function saveWaiting(access: Access): boolean {
  return access.kind === "loading" || (access.kind === "pro" && access.syncing);
}

export function canSave(access: Access): boolean {
  if (access.kind === "pro") return true;
  return access.kind === "free" && access.open && access.left > 0;
}
