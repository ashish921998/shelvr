export type TrialCancellationState = "cancelled" | "none" | "unknown";

type TrialEntitlement = { periodType: string; willRenew: boolean };

export async function readFreshTrialCancellation(purchases: {
  invalidateCustomerInfoCache: () => Promise<void>;
  getCustomerInfo: () => Promise<{
    entitlements: { active: Record<string, TrialEntitlement> };
  }>;
}): Promise<TrialCancellationState> {
  try {
    await purchases.invalidateCustomerInfoCache();
    const info = await purchases.getCustomerInfo();
    return classifyTrialCancellation(Object.values(info.entitlements.active));
  } catch {
    return "unknown";
  }
}

export function classifyTrialCancellation(
  activeEntitlements: TrialEntitlement[],
): TrialCancellationState {
  const cancelledTrial = activeEntitlements.some(
    (entitlement) =>
      entitlement.periodType === "TRIAL" && !entitlement.willRenew,
  );
  return cancelledTrial ? "cancelled" : "none";
}
