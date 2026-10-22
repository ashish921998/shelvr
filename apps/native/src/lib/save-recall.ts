import { RECALL_MIN_AGE_MS } from "@convex/model/recallAge";
import * as SecureStore from "expo-secure-store";

export const RECALL_FRESH_MS = 10 * 60 * 1000;

export const RECALL_MAX_SHOWN = 3;

type RecallFeedItem = {
  _id: string;
  _creationTime: number;
  status: "processing" | "ready" | "failed";
};

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

export function olderMatches<Match extends { _creationTime: number }>(
  similar: readonly Match[],
  saved: { _creationTime: number },
): Match[] {
  return similar.filter(
    (match) => match._creationTime <= saved._creationTime - RECALL_MIN_AGE_MS,
  );
}

const handledKey = (userId: string) => `shelvr.saveRecall.${userId}`;

const HANDLED_HISTORY_LIMIT = 50;

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
