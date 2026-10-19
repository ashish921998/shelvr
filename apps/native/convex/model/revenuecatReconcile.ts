import { internal } from "../_generated/api";
import { env, type ActionCtx } from "../_generated/server";
import { parseRevenueCatSnapshot } from "./revenuecat";

/** Authoritative events (transfer, refund, billing issue) replace local access
 * with the current Pro entitlement. With `grantOnly`, a snapshot without access
 * is dropped, so a caller-triggered sync can add access but never take it. */
export async function reconcileRevenueCatCustomers(
  ctx: ActionCtx,
  userIds: string[],
  eventTimestampMs: number,
  { grantOnly = false }: { grantOnly?: boolean } = {},
): Promise<void> {
  const owners = await ctx.runQuery(internal.subscriptions.liveOwners, {
    userIds: [...new Set(userIds)],
  });
  if (owners.length === 0) return;
  const apiKey = env.REVENUECAT_API_KEY;
  if (!apiKey) throw new Error("RevenueCat API key not configured");
  const snapshots = [];
  for (const userId of owners) {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error("RevenueCat customer lookup failed");
    const body: unknown = await response.json();
    const snapshot = parseRevenueCatSnapshot(
      body,
      env.REVENUECAT_ENTITLEMENT_ID || "Shelvr Pro",
    );
    if (grantOnly && snapshot.status === "lapsed") continue;
    snapshots.push({ userId, ...snapshot });
  }
  if (snapshots.length === 0) return;
  await ctx.runMutation(internal.subscriptions.applySnapshots, {
    snapshots,
    eventTimestampMs,
  });
}
