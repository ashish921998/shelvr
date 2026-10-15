import type { Doc } from "../_generated/dataModel";
import { DIGEST_WINDOW_MS } from "./notificationFields";

// Which saves go on a weekly shelf. Pure policy: the caller in
// notifications.ts reads the rows, checks read state, and persists the shelf.

/** Saves on one shelf. A shelf with fewer is not created. */
export const SHELF_SIZE = 3;
/** The newest saves a shelf is chosen from. */
export const SHELF_SCAN_ITEMS = 1000;
/** Recent shelves whose saves are skipped, so nothing comes back too soon. */
export const SHELF_HISTORY = 12;
/**
 * Older saves checked against read state per shelf. Each check is one index
 * point read, and every opened save spends one, so this bounds the extra reads
 * while leaving plenty of room to find an unopened one.
 */
export const ARCHIVE_CHECKS = 50;

type ShelfItem = Pick<Doc<"items">, "_creationTime" | "status" | "type"> & {
  _id: string;
};

/** Sunday 00:00 UTC of the week `now` falls in: the shelf's idempotency key. */
export function weekStart(now: number): number {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.getTime();
}

/**
 * The saves a shelf may hold, split at the seven-day boundary. A save made
 * exactly `DIGEST_WINDOW_MS` before `now` is still this week's. Order is kept,
 * so both lists stay newest-first like the `by_user` index read.
 */
export function shelfCandidates<Item extends ShelfItem>(
  items: readonly Item[],
  previouslyIncluded: ReadonlySet<string>,
  now: number,
): { recent: Item[]; archive: Item[] } {
  const recent: Item[] = [];
  const archive: Item[] = [];
  for (const item of items) {
    if (item.status !== "ready" || previouslyIncluded.has(item._id)) continue;
    if (item._creationTime >= now - DIGEST_WINDOW_MS) recent.push(item);
    else archive.push(item);
  }
  return { recent, archive };
}

/**
 * Up to a full shelf of this week's unopened saves: the newest save of each
 * type first, for a varied shelf, then the rest by recency. Taking the first
 * two of this list gives the same two a two-slot pick would.
 */
export function chooseRecent<Item extends ShelfItem>(
  unopened: readonly Item[],
): Item[] {
  const selected: Item[] = [];
  const seenTypes = new Set<Item["type"]>();
  for (const item of unopened) {
    if (selected.length >= SHELF_SIZE) break;
    if (!seenTypes.has(item.type)) {
      seenTypes.add(item.type);
      selected.push(item);
    }
  }
  for (const item of unopened) {
    if (selected.length >= SHELF_SIZE) break;
    if (!selected.includes(item)) selected.push(item);
  }
  return selected;
}

/**
 * How many unopened older saves to look for: enough to fill the shelf, and
 * always one, since an older save takes a slot even from a full week.
 */
export function archiveLimit(recentCount: number): number {
  return Math.max(1, SHELF_SIZE - recentCount);
}

/**
 * The older saves to check, in this week's order: shuffled with a seed of the
 * user and week, so a re-run of the same week picks the same saves while a
 * save from two years ago is as likely to come back as one from last month.
 * Only the first `ARCHIVE_CHECKS` are returned.
 */
export function archiveCheckOrder<Item>(
  archive: readonly Item[],
  userId: string,
  now: number,
): Item[] {
  return weeklyShuffle(archive, `${userId}:${weekStart(now)}`).slice(
    0,
    ARCHIVE_CHECKS,
  );
}

/**
 * This week's saves first, then older ones. Finding an older save holds this
 * week's to two slots; without one they keep all three.
 */
export function composeShelf<Item>(
  recent: readonly Item[],
  archive: readonly Item[],
): Item[] {
  const recentLimit = archive.length > 0 ? SHELF_SIZE - 1 : SHELF_SIZE;
  return [...recent.slice(0, recentLimit), ...archive];
}

/** A 32-bit FNV-1a hash, to seed the archive shuffle. */
function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Fisher-Yates over a mulberry32 stream seeded from `seed`. */
export function weeklyShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = hashSeed(seed);
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
