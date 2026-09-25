/**
 * The free save allowance: how many items a user without an active trial or
 * subscription can save before every save routes to the paywall. Pure — no
 * Convex imports — so the native client can load it as
 * `@convex/model/freeSaves`.
 */
export const FREE_SAVE_LIMIT = 20;

/** Saves left in the allowance, never negative. */
export function freeSavesRemaining(used: number): number {
  return Math.max(0, FREE_SAVE_LIMIT - used);
}
