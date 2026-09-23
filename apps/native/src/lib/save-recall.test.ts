import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  olderMatches,
  readHandledRecall,
  recallCandidate,
  RECALL_FRESH_MS,
  RECALL_MIN_AGE_MS,
  writeHandledRecall,
} from "./save-recall";

const store = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
}));

const NOW = 1_800_000_000_000;

function feedItem(
  id: string,
  ageMs: number,
  status: "processing" | "ready" | "failed" = "ready",
) {
  return { _id: id, _creationTime: NOW - ageMs, status };
}

describe("recallCandidate", () => {
  it("picks the newest save once it is ready", () => {
    const items = [feedItem("new", 60_000), feedItem("old", 3_600_000)];
    expect(recallCandidate(items, { now: NOW, handledId: null })?._id).toBe(
      "new",
    );
  });

  it("waits while the newest save is still processing or has failed", () => {
    for (const status of ["processing", "failed"] as const) {
      const items = [feedItem("new", 60_000, status), feedItem("old", 120_000)];
      expect(recallCandidate(items, { now: NOW, handledId: null })).toBeNull();
    }
  });

  it("skips a save that is no longer fresh", () => {
    const items = [feedItem("new", RECALL_FRESH_MS + 1)];
    expect(recallCandidate(items, { now: NOW, handledId: null })).toBeNull();
  });

  it("skips a save this account already handled", () => {
    const items = [feedItem("new", 60_000)];
    expect(recallCandidate(items, { now: NOW, handledId: "new" })).toBeNull();
  });

  it("returns nothing for an empty feed", () => {
    expect(recallCandidate([], { now: NOW, handledId: null })).toBeNull();
  });
});

describe("olderMatches", () => {
  it("keeps only matches saved well before the new save, in ranked order", () => {
    const saved = { _creationTime: NOW };
    const similar = [
      { _id: "yesterday", _creationTime: NOW - 24 * 60 * 60 * 1000 },
      { _id: "months", _creationTime: NOW - 90 * 24 * 60 * 60 * 1000 },
      { _id: "boundary", _creationTime: NOW - RECALL_MIN_AGE_MS },
    ];
    expect(olderMatches(similar, saved).map((m) => m._id)).toEqual([
      "months",
      "boundary",
    ]);
  });
});

describe("handled recall storage", () => {
  beforeEach(() => store.clear());

  it("remembers the handled save per account", () => {
    expect(readHandledRecall("user_a")).toBeNull();
    writeHandledRecall("user_a", "item_1");
    expect(readHandledRecall("user_a")).toBe("item_1");
    expect(readHandledRecall("user_b")).toBeNull();
  });
});
