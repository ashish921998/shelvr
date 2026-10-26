import { youTubeVideo } from "./url";

export function clampRatio(
  ratio: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = ratio && !Number.isNaN(ratio) ? ratio : fallback;
  return Math.min(Math.max(value, min), max);
}

const STOCK_THUMBNAIL_RATIO = 4 / 3;

export function letterboxedVideoRatio(
  pageUrl: string | undefined,
  aspectRatio: number | undefined,
): number | undefined {
  if (
    aspectRatio === undefined ||
    Math.abs(aspectRatio - STOCK_THUMBNAIL_RATIO) > 0.01
  ) {
    return undefined;
  }
  return youTubeVideo(pageUrl) === "video" ? 16 / 9 : undefined;
}
