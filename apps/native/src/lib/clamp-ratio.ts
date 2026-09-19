type ClampRatioOptions = {
  min?: number;
  max?: number;
};

/** Preserve source proportions while bounding pathological extremes. */
export function clampRatio(
  ratio: number | undefined,
  fallback: number,
  { min = 0.5, max = 2 }: ClampRatioOptions = {},
) {
  const value = ratio && !Number.isNaN(ratio) ? ratio : fallback;
  return Math.min(Math.max(value, min), max);
}
