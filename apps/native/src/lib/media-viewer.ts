import { socialPost } from "@/lib/social-post";
import type { PostMedia } from "@convex/model/itemFields";

export const MEDIA_CANVAS = "#000000";

type MediaCandidate = {
  type: "image" | "link" | "note";
  url?: string;
  siteName?: string;
  media?: PostMedia[];
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  isSticker?: boolean;
  hasRecipe?: boolean;
  recipe?: unknown;
};

export function isMediaSave(item: MediaCandidate | undefined): boolean {
  if (!item || item.isSticker) return false;
  if (item.hasRecipe || item.recipe !== undefined) return false;
  if (!(item.imageUrl ?? item.heroImageUrl)) return false;
  return socialPost(item) !== undefined;
}

export function fitMedia(
  aspect: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const height = Math.min(maxWidth / ratio, maxHeight);
  return { width: height * ratio, height };
}

const TAP_SLOP = 12;

type Point = { x: number; y: number };

export function isStillTap(from: Point | null, to: Point): boolean {
  if (!from) return true;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx * dx + dy * dy < TAP_SLOP * TAP_SLOP;
}

const HEADER_SLACK = 16;

export function sheetUnderHeader(
  y: number,
  sheetTop: number,
  wasUnder: boolean,
): boolean {
  return y > sheetTop - HEADER_SLACK * (wasUnder ? 2 : 1);
}

type CaptionState = {
  id: string;
  hidden: boolean;
  expanded: boolean;
};

export function captionFor(
  state: CaptionState | null,
  id: string,
): CaptionState {
  if (state?.id === id) return state;
  return { id, hidden: false, expanded: false };
}

export function toggleCaption(
  state: CaptionState | null,
  id: string,
  flag: "hidden" | "expanded",
): CaptionState {
  const current = captionFor(state, id);
  return { ...current, [flag]: !current[flag] };
}
