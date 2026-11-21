import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingInvite,
  getPendingInvite,
  setPendingInvite,
  subscribePendingInvite,
} from "./pending-invite";

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  setItem: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mocks.storage.get(key) ?? null,
  setItem: mocks.setItem,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.clear();
  mocks.setItem.mockImplementation((key: string, value: string) =>
    mocks.storage.set(key, value),
  );
});

describe("clearPendingInvite", () => {
  it("drops the held invite and tells subscribers", () => {
    setPendingInvite("abc");
    const listener = vi.fn();
    subscribePendingInvite(listener);
    clearPendingInvite();
    expect(getPendingInvite()).toBeNull();
    expect(listener).toHaveBeenCalled();
  });

  it("reports a failed write instead of throwing into the caller", () => {
    setPendingInvite("abc");
    const failure = new Error("keychain locked");
    mocks.setItem.mockImplementationOnce(() => {
      throw failure;
    });
    expect(() => clearPendingInvite()).not.toThrow();
    expect(mocks.captureError).toHaveBeenCalledWith(
      "pending_invite_clear_failed",
      failure,
    );
  });
});
