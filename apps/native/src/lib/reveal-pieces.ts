import type { FeedItem } from "@/components/item-card";

/**
 * One beat of the onboarding reveal. The array order is the on-screen order,
 * and the reveal card renders a piece only once the staged counter has reached
 * its index, so "which pieces exist" stays data rather than a set of booleans
 * the view has to keep in sync.
 */
export type RevealPiece =
  | { kind: "image" }
  | { kind: "title" }
  | { kind: "tag"; tag: string }
  | { kind: "space"; name: string }
  | { kind: "inbox" };

export function buildRevealPieces(
  item: FeedItem,
  savedSpaces: string[],
): RevealPiece[] {
  const pieces: RevealPiece[] = [];
  const image = item.heroImageUrl ?? item.imageUrl;
  if (image) pieces.push({ kind: "image" });
  pieces.push({ kind: "title" });
  for (const tag of item.tags) pieces.push({ kind: "tag", tag });
  const destination = savedSpaces[0];
  pieces.push(
    destination === undefined
      ? { kind: "inbox" }
      : { kind: "space", name: destination },
  );
  return pieces;
}

/**
 * The word the onboarding recap types into its search mock. Short runs make
 * useless queries, so a title with nothing long enough gets no search demo at
 * all rather than a weak one.
 */
export function searchWordFor(title: string | undefined): string | null {
  let longest: string | null = null;
  for (const run of title?.match(/\p{L}+/gu) ?? []) {
    if (run.length < 4) continue;
    if (longest === null || run.length > longest.length) longest = run;
  }
  return longest === null ? null : longest.toLowerCase();
}
