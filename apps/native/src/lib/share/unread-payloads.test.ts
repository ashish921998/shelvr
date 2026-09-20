import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasUnreadSharedPayloads } from "./unread-payloads";

const mock = vi.hoisted(() => ({
  getSharedPayloads: vi.fn(),
}));

vi.mock("expo-sharing", () => ({
  getSharedPayloads: mock.getSharedPayloads,
}));

beforeEach(() => {
  mock.getSharedPayloads.mockReset();
});

describe("hasUnreadSharedPayloads", () => {
  it("is true while the native store holds a payload no screen consumed", () => {
    mock.getSharedPayloads.mockReturnValueOnce([
      { value: "https://x.test/article", shareType: "url" },
    ]);
    expect(hasUnreadSharedPayloads()).toBe(true);
  });

  it("is false once the share screen has cleared the store", () => {
    mock.getSharedPayloads.mockReturnValueOnce([]);
    expect(hasUnreadSharedPayloads()).toBe(false);
  });

  it("is false when the store cannot be read (web, missing module)", () => {
    // The web shim throws for every share-payload API; the predicate must
    // degrade to "nothing owed" rather than take the caller down with it.
    mock.getSharedPayloads.mockImplementationOnce(() => {
      throw new Error("Receiving share payloads is not supported on web.");
    });
    expect(hasUnreadSharedPayloads()).toBe(false);
  });
});
