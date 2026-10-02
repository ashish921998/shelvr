import { socialPost } from "@/lib/social-post";
import type { PostMedia } from "@convex/model/itemFields";

/** The page background behind a media save, whatever the app theme. */
export const MEDIA_CANVAS = "#000000";

type MediaCandidate = {
  type: "image" | "link" | "note";
  url?: string;
  siteName?: string;
  media?: PostMedia[];
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  isSticker?: boolean;
};

/**
 * Whether a save opens in the full-screen media viewer: a photo, or a social
 * post (reel, short, carousel) that has a picture to show. Articles, notes and
 * plain links keep the reading layout, and a die-cut sticker keeps its paper
 * ground, where its cut-out edge reads.
 */
export function isMediaSave(item: MediaCandidate | undefined): boolean {
  if (!item || item.isSticker) return false;
  if (!(item.imageUrl ?? item.heroImageUrl)) return false;
  if (item.type === "image") return true;
  return socialPost(item) !== undefined;
}

/** The largest size with `aspect` (width / height) that fits the box. */
export function fitMedia(
  aspect: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const height = Math.min(maxWidth / ratio, maxHeight);
  return { width: height * ratio, height };
}
