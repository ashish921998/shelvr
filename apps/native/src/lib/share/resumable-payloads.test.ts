import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fingerprintSharePayloads,
  type RawSharePayload,
} from "@/lib/share/storage";
import { hasResumableSharedPayloads } from "./resumable-payloads";

const mock = vi.hoisted(() => ({
  getSharedPayloads: vi.fn(),
  discardedFingerprint: null as string | null,
}));

vi.mock("expo-sharing", () => ({
  getSharedPayloads: mock.getSharedPayloads,
}));
vi.mock("@/lib/share/pending-share-store", () => ({
  shareWasDiscardedOnDevice: (fingerprint: string) =>
    fingerprint === mock.discardedFingerprint,
}));

const batch: RawSharePayload[] = [
  { value: "https://x.test/article", shareType: "url" },
];

beforeEach(() => {
  mock.getSharedPayloads.mockReset();
  mock.discardedFingerprint = null;
});

describe("hasResumableSharedPayloads", () => {
  it("is true while the native store holds a payload no screen consumed", () => {
    mock.getSharedPayloads.mockReturnValueOnce(batch);
    expect(hasResumableSharedPayloads()).toBe(true);
  });

  it("is false once the share screen has cleared the store", () => {
    mock.getSharedPayloads.mockReturnValueOnce([]);
    expect(hasResumableSharedPayloads()).toBe(false);
  });

  it("is false for the leftover of a share the user explicitly discarded", () => {
    // The P2 review case: the share screen's Cancel path tolerated a throwing
    // clearSharedPayloads() and left the payload behind. That leftover must
    // not route back to the share screen and re-save the discarded batch.
    mock.getSharedPayloads.mockReturnValue(batch);
    mock.discardedFingerprint = fingerprintSharePayloads(batch);
    expect(hasResumableSharedPayloads()).toBe(false);
  });

  it("is true for a new batch that superseded the discarded one", () => {
    // A different share replaced the leftover natively: the discard record no
    // longer describes what the store holds, so the new batch resumes.
    mock.getSharedPayloads.mockReturnValueOnce(batch);
    mock.discardedFingerprint = fingerprintSharePayloads([
      { value: "https://other.test/post", shareType: "url" },
    ]);
    expect(hasResumableSharedPayloads()).toBe(true);
  });

  it("is false when the store cannot be read (web, missing module)", () => {
    // The web shim throws for every share-payload API; the predicate must
    // degrade to "nothing owed" rather than take the caller down with it.
    mock.getSharedPayloads.mockImplementationOnce(() => {
      throw new Error("Receiving share payloads is not supported on web.");
    });
    expect(hasResumableSharedPayloads()).toBe(false);
  });
});
