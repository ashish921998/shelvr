// How Home divides the feed into shelves. Home is not a grid: saves stand in
// rows on drawn boards, and each board needs a name that is true of everything
// on it.
//
// Recency is the only grouping the feed row can support honestly. Grouping by
// space would need the shelf each save belongs to, and `itemCardValidator`
// does not carry it — see `lib/ink/save-mark.ts` for the same limit.

/** Everything the grouping reads. A subset of the feed row. */
type ShelvedItem = { _creationTime?: number };

export type ShelfSection = "new" | "earlier";

type HomeShelf<T> = {
  section: ShelfSection;
  items: T[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Splits the feed into "New this week" and "Earlier", keeping the feed's own
 * order inside each. A shelf with nothing on it is left out rather than drawn
 * empty — an empty shelf means something on its own, and it is not this.
 *
 * `now` is passed in rather than read, so the split is deterministic in tests.
 */
export function groupIntoShelves<T extends ShelvedItem>(
  items: readonly T[],
  now: number,
): HomeShelf<T>[] {
  const fresh: T[] = [];
  const older: T[] = [];
  for (const item of items) {
    // A save with no creation time is new until proven otherwise: it has just
    // been written and the server has not echoed its row back yet.
    const savedAt = item._creationTime ?? now;
    (savedAt >= now - WEEK_MS ? fresh : older).push(item);
  }
  const shelves: HomeShelf<T>[] = [];
  if (fresh.length > 0) shelves.push({ section: "new", items: fresh });
  if (older.length > 0) shelves.push({ section: "earlier", items: older });
  return shelves;
}
