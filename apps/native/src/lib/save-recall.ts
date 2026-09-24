import * as SecureStore from "expo-secure-store";

// The save recall card: right after a save turns ready, Home shows the older
// saves it relates to, so something saved weeks ago comes back at the moment
// the person is thinking about the same thing again.

/** How old a save may be, measured against `now`, and still get the card. Past
 * this, the person has moved on and the prompt is no longer about what they
 * just did. A save newer than `now` always qualifies. */
export const RECALL_FRESH_MS = 10 * 60 * 1000;

/** A match must be at least this much older than the new save. Newer matches
 * are still in the person's head and on the first screen of the feed. */
export const RECALL_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Thumbnails the card shows. The count in the copy covers every match. */
export const RECALL_MAX_SHOWN = 3;

type RecallFeedItem = {
  _id: string;
  _creationTime: number;
  status: "processing" | "ready" | "failed";
};

/** The save the card is about: the newest item, once it is ready, while it is
 * still fresh, and only if this account has not already handled it. */
export function recallCandidate<Item extends RecallFeedItem>(
  items: readonly Item[],
  { now, handledIds }: { now: number; handledIds: readonly string[] },
): Item | null {
  const newest = items[0];
  if (newest === undefined || newest.status !== "ready") return null;
  if (now - newest._creationTime > RECALL_FRESH_MS) return null;
  if (handledIds.includes(newest._id)) return null;
  return newest;
}

/** The similar items worth recalling: only those saved well before `saved`,
 * in the order the backend ranked them. */
export function olderMatches<Match extends { _creationTime: number }>(
  similar: readonly Match[],
  saved: { _creationTime: number },
): Match[] {
  return similar.filter(
    (match) => match._creationTime <= saved._creationTime - RECALL_MIN_AGE_MS,
  );
}

// Keyed per account, like the other one-shot Home prompts in first-share.ts.
const handledKey = (userId: string) => `shelvr.saveRecall.${userId}`;

// Bounds the stored history so it never grows without limit. Far more than a
// person could plausibly need: the feed reorders around a deleted save far
// less often than this many saves happen in between.
const HANDLED_HISTORY_LIMIT = 50;

/** The saves this account has already evaluated the card for, shown or not,
 * oldest first. Kept as a bounded history (not just the latest one) so a
 * deleted later save can't resurface an earlier dismissal: if only the
 * newest handled id were remembered, deleting it could let the feed's new
 * newest item match an id that was actually handled further back. */
export function readHandledRecall(userId: string): string[] {
  const raw = SecureStore.getItem(handledKey(userId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeHandledRecall(userId: string, itemId: string): void {
  const handled = readHandledRecall(userId).filter((id) => id !== itemId);
  handled.push(itemId);
  const bounded = handled.slice(-HANDLED_HISTORY_LIMIT);
  SecureStore.setItem(handledKey(userId), JSON.stringify(bounded));
}
