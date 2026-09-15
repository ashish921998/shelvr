import { internal } from "../_generated/api";
import { env, type ActionCtx } from "../_generated/server";
import { parseRevenueCatSnapshot } from "./revenuecat";

export async function reconcileRevenueCatTransfer(
  ctx: ActionCtx,
  from: string[],
  to: string[],
  eventTimestampMs: number,
): Promise<void> {
  await reconcileRevenueCatCustomers(ctx, [...from, ...to], eventTimestampMs);
}

/** Refunds and transfers both replace local access with the current Pro entitlement. */
export async function reconcileRevenueCatCustomers(
  ctx: ActionCtx,
  userIds: string[],
  eventTimestampMs: number,
): Promise<void> {
  const owners = await ctx.runQuery(internal.subscriptions.transferOwners, {
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
    snapshots.push({
      userId,
      ...parseRevenueCatSnapshot(
        body,
        env.REVENUECAT_ENTITLEMENT_ID ?? "Shelvr Pro",
      ),
    });
  }
  await ctx.runMutation(internal.subscriptions.reconcileTransfer, {
    snapshots,
    eventTimestampMs,
  });
}
