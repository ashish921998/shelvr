type ListGateInput = {
  onboarded: boolean;
  gated: boolean;
  lists: { length: number } | undefined;
};

export function listRouteAllowed({
  onboarded,
  gated,
  lists,
}: ListGateInput): boolean {
  if (!onboarded) return false;
  if (!gated) return true;
  return lists === undefined || lists.length > 0;
}

export function personalPlanAllowed(
  gated: boolean,
  listId: string | undefined,
): boolean {
  return !gated || listId !== undefined;
}
