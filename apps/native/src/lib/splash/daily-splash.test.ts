import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  localDay,
  playedSplashToday,
  recordSplashPlayed,
} from "./daily-splash";

const storage = vi.hoisted(() => ({
  values: new Map<string, string>(),
  failing: false,
}));

const captureError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ analytics: { captureError } }));

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
  captureError.mockClear();
});

describe("daily splash", () => {
  it("plays until today's splash is recorded, then not again that day", () => {
    const morning = new Date(2026, 9, 22, 8, 0);
    const evening = new Date(2026, 9, 22, 23, 59);
    expect(playedSplashToday(morning)).toBe(false);
    expect(playedSplashToday(morning)).toBe(false);
    recordSplashPlayed(morning);
    expect(playedSplashToday(morning)).toBe(true);
    expect(playedSplashToday(evening)).toBe(true);
  });

  it("plays again on the next local day", () => {
    recordSplashPlayed(new Date(2026, 9, 22, 23, 59));
    expect(playedSplashToday(new Date(2026, 9, 23, 0, 1))).toBe(false);
  });

  it("plays when storage fails, rather than never", () => {
    storage.failing = true;
    recordSplashPlayed(new Date(2026, 9, 22, 8, 0));
    expect(playedSplashToday(new Date(2026, 9, 22, 9, 0))).toBe(false);
    expect(captureError).toHaveBeenCalledWith(
      "splash_daily_record_failed",
      expect.any(Error),
    );
    expect(captureError).toHaveBeenCalledWith(
      "splash_daily_read_failed",
      expect.any(Error),
    );
  });

  it("names the local calendar day", () => {
    expect(localDay(new Date(2026, 0, 5, 0, 30))).toBe("2026-01-05");
  });
});
