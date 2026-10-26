import { internal } from "../_generated/api";
import { env, type ActionCtx } from "../_generated/server";
import { isDevDeployment } from "./deployment";
import { grantedByTestStore, parseRevenueCatSnapshot } from "./revenuecat";

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
  const entitlement = env.REVENUECAT_ENTITLEMENT_ID || "Shelvr Pro";
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
    // A Test Store purchase says nothing about paid access, so this customer's row stays as it is.
    if (!isDevDeployment() && grantedByTestStore(body, entitlement)) continue;
    snapshots.push({ userId, ...parseRevenueCatSnapshot(body, entitlement) });
  }
  await ctx.runMutation(internal.subscriptions.applySnapshots, {
    snapshots,
    eventTimestampMs,
    ...(grantOnly ? { grantOnly } : {}),
  });
}
