// Which drawn mark a save carries. The mark is the one thing on a card that
// says what kind of thing it is, so it is derived from the card row alone —
// no extra query, and no guessing that changes as data arrives.
//
// Known gap: `itemCardValidator` deliberately omits `recipe` and `products`
// (they are detail-only fields), so a recipe or a product is recognised from
// its tags here rather than from the enrichment itself. Carrying a `kind` on
// the card row would make this exact; that is a backend change and has to
// ship expand-first, so it is not done here.

import { shortFormSource } from "@convex/model/externalUrl";
import type { PostMedia } from "@convex/model/itemFields";
import type { SaveKind } from "@/lib/save-kinds";
import type { MarkKind } from "@/lib/ink/strokes";

/** Everything the mark is decided from. A subset of `FeedItem`. */
type MarkSource = {
  type: "image" | "link" | "note";
  url?: string;
  siteName?: string;
  media?: PostMedia[];
  tags?: readonly string[];
};

const RECIPE_TAGS = ["recipe", "recipes", "cooking", "baking", "dinner"];
const PRODUCT_TAGS = [
  "product",
  "products",
  "wishlist",
  "shopping",
  "gift",
  "gifts",
];

function taggedAs(
  tags: readonly string[] | undefined,
  words: readonly string[],
): boolean {
  if (!tags) return false;
  return tags.some((tag) => words.includes(tag.trim().toLowerCase()));
}

/** True when the save is a clip rather than a page: a short-form video link,
 * or a social post whose lead media plays. */
function isClip(item: MarkSource): boolean {
  if (item.type !== "link") return false;
  const shortForm = shortFormSource(item.url);
  if (shortForm) return shortForm.video;
  const lead = item.media?.[0];
  return lead !== undefined && lead.kind !== "photo";
}

/**
 * The mark for a save. Order matters: what a thing *is* (a note, a photo, a
 * clip) beats what it is *about* (tagged as a recipe).
 */
export function saveMark(item: MarkSource): MarkKind {
  if (item.type === "note") return "note";
  if (item.type === "image") return "photo";
  if (isClip(item)) return "video";
  if (taggedAs(item.tags, RECIPE_TAGS)) return "recipe";
  if (taggedAs(item.tags, PRODUCT_TAGS)) return "product";
  return "article";
}

/**
 * The mark that stands for a save kind in onboarding's picker. Several kinds
 * share a mark — there are more kinds than drawn shapes — so the tile's label
 * carries the distinction and the mark carries the family.
 */
export function kindMark(kind: SaveKind): MarkKind {
  switch (kind) {
    case "Articles":
      return "article";
    case "Recipes":
      return "recipe";
    case "Products":
    case "Home & decor":
      return "product";
    case "Travel":
      return "photo";
    case "Videos":
      return "video";
    case "Inspiration":
    case "Fitness":
      return "note";
  }
}
