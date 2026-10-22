export type SubscriptionStatus = "trialing" | "pro" | "lapsed" | "lifetime";

export function isEntitledStatus(status: SubscriptionStatus | "none"): boolean {
  return status === "trialing" || status === "pro" || status === "lifetime";
}

export function isEntitled(
  status: SubscriptionStatus | "none",
  expiresAt: number | undefined,
  now: number,
): boolean {
  if (status === "lifetime") return true;
  if (!isEntitledStatus(status)) return false;
  return (expiresAt ?? 0) > now;
}
