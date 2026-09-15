import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasPendingWeeklyShelfOptIn,
  setPendingWeeklyShelfOptIn,
  syncPendingWeeklyShelfOptIn,
} from "./pending-notification-preference";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
}));

beforeEach(() => storage.clear());

describe("pending notification preference", () => {
  it("retains an onboarding opt-in until authenticated setup completes", () => {
    expect(hasPendingWeeklyShelfOptIn()).toBe(false);
    setPendingWeeklyShelfOptIn(true);
    expect(hasPendingWeeklyShelfOptIn()).toBe(true);
    setPendingWeeklyShelfOptIn(false);
    expect(hasPendingWeeklyShelfOptIn()).toBe(false);
  });

  it("scopes the preference to the configured Convex deployment", () => {
    setPendingWeeklyShelfOptIn(true);
    expect([...storage.keys()]).toEqual([
      "shelvr.pending.weekly-shelf-default",
    ]);
  });

  it("clears the intent only after the server preference is enabled", async () => {
    setPendingWeeklyShelfOptIn(true);
    await syncPendingWeeklyShelfOptIn(async () => false);
    expect(hasPendingWeeklyShelfOptIn()).toBe(true);

    await syncPendingWeeklyShelfOptIn(async () => true);
    expect(hasPendingWeeklyShelfOptIn()).toBe(false);
  });

  it("does not run setup without a pending opt-in", async () => {
    const enable = vi.fn(async () => true);
    await syncPendingWeeklyShelfOptIn(enable);
    expect(enable).not.toHaveBeenCalled();
  });
});
