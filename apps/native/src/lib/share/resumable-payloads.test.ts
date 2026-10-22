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
    mock.getSharedPayloads.mockReturnValue(batch);
    mock.discardedFingerprint = fingerprintSharePayloads(batch);
    expect(hasResumableSharedPayloads()).toBe(false);
  });

  it("is true for a new batch that superseded the discarded one", () => {
    mock.getSharedPayloads.mockReturnValueOnce(batch);
    mock.discardedFingerprint = fingerprintSharePayloads([
      { value: "https://other.test/post", shareType: "url" },
    ]);
    expect(hasResumableSharedPayloads()).toBe(true);
  });

  it("is false when the store cannot be read (web, missing module)", () => {
    mock.getSharedPayloads.mockImplementationOnce(() => {
      throw new Error("Receiving share payloads is not supported on web.");
    });
    expect(hasResumableSharedPayloads()).toBe(false);
  });
});
