import { beforeEach, describe, expect, it, vi } from "vitest";

import { claimDailySplash, localDay } from "./daily-splash";

const storage = vi.hoisted(() => ({
  values: new Map<string, string>(),
  failing: false,
}));

vi.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => {
      if (storage.failing) throw new Error("storage unavailable");
      return storage.values.get(key);
    },
    set: (key: string, value: string) => {
      if (storage.failing) throw new Error("storage unavailable");
      storage.values.set(key, value);
    },
  }),
}));

beforeEach(() => {
  storage.values.clear();
  storage.failing = false;
});

describe("claimDailySplash", () => {
  it("plays on the first launch of a day and not again that day", () => {
    const morning = new Date(2026, 9, 22, 8, 0);
    const evening = new Date(2026, 9, 22, 23, 59);
    expect(claimDailySplash(morning)).toBe(true);
    expect(claimDailySplash(morning)).toBe(false);
    expect(claimDailySplash(evening)).toBe(false);
  });

  it("plays again on the next local day", () => {
    expect(claimDailySplash(new Date(2026, 9, 22, 23, 59))).toBe(true);
    expect(claimDailySplash(new Date(2026, 9, 23, 0, 1))).toBe(true);
  });

  it("plays when storage fails, rather than never", () => {
    storage.failing = true;
    expect(claimDailySplash(new Date(2026, 9, 22, 8, 0))).toBe(true);
    expect(claimDailySplash(new Date(2026, 9, 22, 9, 0))).toBe(true);
  });

  it("names the local calendar day", () => {
    expect(localDay(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
  });
});
