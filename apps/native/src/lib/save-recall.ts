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
  { now, handledId }: { now: number; handledId: string | null },
): Item | null {
  const newest = items[0];
  if (newest === undefined || newest.status !== "ready") return null;
  if (now - newest._creationTime > RECALL_FRESH_MS) return null;
  if (newest._id === handledId) return null;
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

/** The last save the card was evaluated for, shown or not. */
export function readHandledRecall(userId: string): string | null {
  return SecureStore.getItem(handledKey(userId));
}

export function writeHandledRecall(userId: string, itemId: string): void {
  SecureStore.setItem(handledKey(userId), itemId);
}
