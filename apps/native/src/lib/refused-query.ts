/**
 * True when a Convex query failed for good: the server refused the call
 * (a malformed id, a validator rejection, an exception in the function).
 * An auth error is not that: `convex-query-healing` re-subscribes the query
 * once the token is back, so it reads as still loading. The string is the
 * one `observeAuthQueryErrors` keys on.
 */
export function isRefusedQuery(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  return !String(error).includes("Not authenticated");
}
