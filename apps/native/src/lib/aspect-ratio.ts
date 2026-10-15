import { isYouTubeVideoUrl } from "./url";

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

// YouTube's stock thumbnails (default, hqdefault, sddefault) are 4:3 frames
// with the 16:9 video letterboxed between black bars, and oEmbed hands out
// hqdefault. mqdefault and maxres are already 16:9.
const STOCK_THUMBNAIL_RATIO = 4 / 3;

/**
 * 16:9 when the save at `pageUrl` is a YouTube video whose picture is 4:3,
 * so a cover fit at that shape crops the black bars away; otherwise undefined.
 * The client only ever gets Shelvr's stored copy of the picture, so the shape
 * the save recorded is the tell, not the picture's address. A Short is left
 * alone: its thumbnail pillarboxes a vertical video, which a widescreen crop
 * would only make worse.
 */
export function letterboxedVideoRatio(
  pageUrl: string | undefined,
  aspectRatio: number | undefined,
): number | undefined {
  if (
    aspectRatio === undefined ||
    Math.abs(aspectRatio - STOCK_THUMBNAIL_RATIO) > 0.01 ||
    !isYouTubeVideoUrl(pageUrl)
  ) {
    return undefined;
  }
  try {
    return new URL(pageUrl ?? "").pathname.startsWith("/shorts/")
      ? undefined
      : 16 / 9;
  } catch {
    return undefined;
  }
}
