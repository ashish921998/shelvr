import { isYouTubeUrl } from "@convex/model/externalUrl";

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
// with the 16:9 video letterboxed between black bars. mqdefault and maxres are
// already 16:9.
const LETTERBOXED_THUMBNAIL =
  /^\/vi(?:_webp)?\/[^/]+\/(?:hq|sd)?default(?:_live)?\.(?:jpg|webp)$/;

/**
 * 16:9 when `imageUri` is a letterboxed YouTube thumbnail of the video at
 * `pageUrl`, so a cover fit at that shape crops the black bars away; otherwise
 * undefined. A Short is left alone: its thumbnail pillarboxes a vertical video,
 * which a widescreen crop would only make worse.
 */
export function letterboxedVideoRatio(
  pageUrl: string | undefined,
  imageUri: string | null | undefined,
): number | undefined {
  if (!pageUrl || !imageUri || !isYouTubeUrl(pageUrl)) return undefined;
  try {
    const image = new URL(imageUri);
    if (new URL(pageUrl).pathname.startsWith("/shorts/")) return undefined;
    return /(^|\.)ytimg\.com$/.test(image.hostname) &&
      LETTERBOXED_THUMBNAIL.test(image.pathname)
      ? 16 / 9
      : undefined;
  } catch {
    return undefined;
  }
}
