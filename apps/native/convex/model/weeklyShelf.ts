import type { Doc } from "../_generated/dataModel";
import { DIGEST_WINDOW_MS } from "./notificationFields";

export const SHELF_SIZE = 3;
export const SHELF_SCAN_ITEMS = 1000;
// Article saves carry up to 100k characters each; 1,000 of them would pass the transaction read limit.
export const SHELF_SCAN_BYTES = 6 * 1024 * 1024;
export const SHELF_HISTORY = 12;
export const ARCHIVE_CHECKS = 50;

type ShelfItem = Pick<Doc<"items">, "_creationTime" | "status" | "type"> & {
  _id: string;
};

export function weekStart(now: number): number {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.getTime();
}

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

export function archiveLimit(recentCount: number): number {
  return Math.max(1, SHELF_SIZE - recentCount);
}

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

export function composeShelf<Item>(
  recent: readonly Item[],
  archive: readonly Item[],
): Item[] {
  const recentLimit = archive.length > 0 ? SHELF_SIZE - 1 : SHELF_SIZE;
  return [...recent.slice(0, recentLimit), ...archive];
}

function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

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
    // Both indexes are in range: 0 <= j <= i < shuffled.length.
    [shuffled[i], shuffled[j]] = [shuffled[j] as T, shuffled[i] as T];
  }
  return shuffled;
}
