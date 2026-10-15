/**
 * Bounds a cover's aspect ratio for layout. Falls back to `fallback` when the
 * ratio is missing or NaN, then clamps to `[min, max]`. Preserves the true
 * proportions so previews aren't cropped; only bounds pathological extremes so
 * one very tall or wide cover can't hijack its cell. Callers pass the bounds
 * their layout allows.
 */
export function clampRatio(
  ratio: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = ratio && !Number.isNaN(ratio) ? ratio : fallback;
  return Math.min(Math.max(value, min), max);
}
