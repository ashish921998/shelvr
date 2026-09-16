import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirectSystemPath } from "@/app/+native-intent";

const { markPendingShareOnDevice, secureStore } = vi.hoisted(() => ({
  markPendingShareOnDevice: vi.fn(),
  secureStore: {
    values: new Map<string, string>(),
    failRead: false,
  },
}));

vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => {
    if (secureStore.failRead) throw new Error("keychain unavailable");
    return secureStore.values.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    secureStore.values.set(key, value);
  },
}));

vi.mock("@/lib/share/pending-share-store", () => ({
  markPendingShareOnDevice,
}));

describe("redirectSystemPath", () => {
  beforeEach(() => {
    markPendingShareOnDevice.mockClear();
    secureStore.values.clear();
    secureStore.failRead = false;
    secureStore.values.set("shelvr.onboarded", "true");
  });

  it.each([
    "shelvr://auth/callback?code=verification-code",
    "shelvr:///auth/callback?code=verification-code",
  ])("keeps OAuth callbacks on the sign-in route for %s", (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe("/sign-in");
    expect(markPendingShareOnDevice).not.toHaveBeenCalled();
  });

  it("continues routing share intents to the share receiver", () => {
    expect(
      redirectSystemPath({ path: "shelvr://expo-sharing", initial: false }),
    ).toBe("/share");
    expect(markPendingShareOnDevice).toHaveBeenCalledOnce();
  });

  it("sends shares to onboarding without a resume flag before onboarding", () => {
    secureStore.values.delete("shelvr.onboarded");
    expect(
      redirectSystemPath({ path: "shelvr://expo-sharing", initial: true }),
    ).toBe("/onboarding");
    expect(markPendingShareOnDevice).not.toHaveBeenCalled();
  });

  it("keeps routing shares to the receiver when the onboarded flag is unreadable", () => {
    secureStore.failRead = true;
    expect(
      redirectSystemPath({ path: "shelvr://expo-sharing", initial: false }),
    ).toBe("/share");
    expect(markPendingShareOnDevice).toHaveBeenCalledOnce();
  });

  it("leaves unrelated deep links untouched", () => {
    const path = "shelvr:///add";
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
  });
});
