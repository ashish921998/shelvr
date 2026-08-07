/**
 * The canonical entitlement gate, shared by the server-side mutation guard
 * (`requireProEntitlement`) and the client-side `useEntitlement` hook so both
 * agree on what "entitled" means. Pure — no Convex imports — so it bundles
 * safely into the React Native client via the `@convex/model/entitlement`
 * alias.
 *
 * `"none"` is a client-facing sentinel (no subscription row exists) included
 * here so the hook can pass the query status straight through; the stored DB
 * status is never `"none"`.
 */
export type SubscriptionStatus = "trialing" | "pro" | "lapsed" | "lifetime";

/**
 * True when the user has active access. `lifetime` is permanently entitled;
 * `lapsed`/`none` are not; `trialing`/`pro` are entitled until `expiresAt`.
 * `now` is passed in (never read here) so the server can use `Date.now()`
 * inside a mutation and the client can seed/tick its own clock.
 */
export function isEntitled(
  status: SubscriptionStatus | "none",
  expiresAt: number | undefined,
  now: number,
): boolean {
  if (status === "lifetime") return true;
  if (status === "none" || status === "lapsed") return false;
  return (expiresAt ?? 0) > now;
}
