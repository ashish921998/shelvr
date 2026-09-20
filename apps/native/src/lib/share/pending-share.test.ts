import { describe, expect, it } from "vitest";

import {
  clearPendingShareInStore,
  clearShareDiscardedInStore,
  decidePostAuthRoute,
  decideShareRoute,
  hasPendingShareInStore,
  markPendingShareInStore,
  markShareDiscardedInStore,
  shareWasDiscardedInStore,
  DISCARDED_SHARE_KEY,
  PENDING_SHARE_KEY,
  type PendingShareStore,
} from "@/lib/share/pending-share";

function memoryStore(initial: Record<string, string> = {}): PendingShareStore {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("pending share flag", () => {
  it("marks and reports a pending share", () => {
    const store = memoryStore();
    expect(hasPendingShareInStore(store)).toBe(false);

    markPendingShareInStore(store);
    expect(hasPendingShareInStore(store)).toBe(true);
    expect(store.getItem(PENDING_SHARE_KEY)).toBe("1");
  });

  it("clearPendingShareInStore drops the flag", () => {
    const store = memoryStore();
    markPendingShareInStore(store);
    clearPendingShareInStore(store);
    expect(hasPendingShareInStore(store)).toBe(false);
  });
});

describe("discarded share record", () => {
  const batchA =
    '[{"value":"https://a.test/x","shareType":"url","mimeType":null}]';
  const batchB =
    '[{"value":"https://b.test/y","shareType":"url","mimeType":null}]';

  it("matches exactly the batch recorded at discard time", () => {
    const store = memoryStore();
    expect(shareWasDiscardedInStore(store, batchA)).toBe(false);

    markShareDiscardedInStore(store, batchA);
    expect(shareWasDiscardedInStore(store, batchA)).toBe(true);
    expect(store.getItem(DISCARDED_SHARE_KEY)).toBe(batchA);
  });

  it("does not suppress a different, superseding batch", () => {
    const store = memoryStore();
    markShareDiscardedInStore(store, batchA);
    expect(shareWasDiscardedInStore(store, batchB)).toBe(false);
  });

  it("clearShareDiscardedInStore lets a later identical re-share resume", () => {
    const store = memoryStore();
    markShareDiscardedInStore(store, batchA);
    clearShareDiscardedInStore(store);
    expect(shareWasDiscardedInStore(store, batchA)).toBe(false);
  });
});

describe("decideShareRoute", () => {
  it("opens the share screen when the user is onboarded and signed in", () => {
    expect(
      decideShareRoute({ onboarded: true, isAuthenticated: true }),
    ).toEqual({ action: "open-share" });
  });

  it("defers during onboarding so the share can resume after finish", () => {
    expect(
      decideShareRoute({ onboarded: false, isAuthenticated: false }),
    ).toEqual({ action: "defer-onboarding", markPending: true });
    expect(
      decideShareRoute({ onboarded: false, isAuthenticated: true }),
    ).toEqual({ action: "defer-onboarding", markPending: true });
  });

  it("defers to sign-in when onboarded but signed out", () => {
    expect(
      decideShareRoute({ onboarded: true, isAuthenticated: false }),
    ).toEqual({
      action: "defer-sign-in",
      markPending: true,
      href: "/(auth)/sign-in",
    });
  });
});

describe("decidePostAuthRoute", () => {
  it("resumes the share flow when a share is owed", () => {
    // The two owed signals (deferred flag, resumable payload batch) merge
    // into hasOwedShare at the call site, so the matrix collapses to the
    // outcome itself.
    expect(decidePostAuthRoute({ hasOwedShare: true })).toBe("/share");
  });

  it("lands on home when nothing is owed", () => {
    expect(decidePostAuthRoute({ hasOwedShare: false })).toBe("/");
  });
});
