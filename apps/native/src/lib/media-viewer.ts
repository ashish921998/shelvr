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

// How far (in points) a finger may travel and still count as a tap.
const TAP_SLOP = 12;

type Point = { x: number; y: number };

/**
 * Whether a press that began at `from` and ended at `to` (screen coordinates)
 * was a tap. An edge swipe back carries the whole screen with the finger, so
 * the touch never leaves the picture; only its travel gives the swipe away.
 */
export function isStillTap(from: Point | null, to: Point): boolean {
  if (!from) return true;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx * dx + dy * dy < TAP_SLOP * TAP_SLOP;
}

// How close the sheet's top comes to the header's bottom edge before the
// header switches to the light page's colors (and twice that to switch back).
const HEADER_SLACK = 16;

/**
 * Whether the details sheet sits under the header at scroll offset `y`, given
 * the offset where the sheet's top meets the header. The switch back needs
 * twice the slack, so a scroll resting near the edge doesn't flip the header
 * every frame.
 */
export function sheetUnderHeader(
  y: number,
  sheetTop: number,
  wasUnder: boolean,
): boolean {
  return y > sheetTop - HEADER_SLACK * (wasUnder ? 2 : 1);
}

/** A media page's caption state, for the save it currently shows. */
export type CaptionState = {
  id: string;
  hidden: boolean;
  expanded: boolean;
};

/**
 * The caption state for save `id`: `state` itself while the page still shows
 * that save, else a fresh one (caption showing, description collapsed). A
 * recycled page moving A → B → A therefore never brings A's old state back.
 */
export function captionFor(
  state: CaptionState | null,
  id: string,
): CaptionState {
  if (state?.id === id) return state;
  return { id, hidden: false, expanded: false };
}

/** Flips one caption flag for save `id`. */
export function toggleCaption(
  state: CaptionState | null,
  id: string,
  flag: "hidden" | "expanded",
): CaptionState {
  const current = captionFor(state, id);
  return { ...current, [flag]: !current[flag] };
}
