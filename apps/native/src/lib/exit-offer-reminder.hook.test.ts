// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { useCurrentUser } from "@/lib/current-user";
import { useEntitlement, useExitOfferEndsAt } from "@/lib/entitlement";
import { useExitOfferReminder } from "./exit-offer-reminder";

/**
 * The hook alone, under a DOM: the sync it drives is covered without one in
 * `exit-offer-reminder.test.ts`. What matters here is the timing between the
 * account loading and the sync, so every test runs on fake timers and flushes
 * them explicitly.
 */

const mock = vi.hoisted(() => ({
  getItem: vi.fn(),
  permission: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: vi.fn(),
  useExitOfferEndsAt: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({
  getItem: mock.getItem,
  setItem: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  getPermissionsAsync: mock.permission,
  requestPermissionsAsync: vi.fn(),
  scheduleNotificationAsync: mock.schedule,
  cancelScheduledNotificationAsync: mock.cancel,
}));

const HOUR = 60 * 60 * 1000;
const now = 1_000_000_000_000;

type Entitlement = ReturnType<typeof useEntitlement>;
type CurrentUser = ReturnType<typeof useCurrentUser>;

const entitlement = (loading: boolean): Entitlement => ({
  status: "none",
  entitled: false,
  loading,
  now,
});

// A React Query result has a dozen fields the hook never reads; only `data`
// is built here, so this is the one place the test reaches past the type.
const currentUser = (data: CurrentUser["data"]): CurrentUser =>
  ({ data }) as CurrentUser;

/** An opted-in account whose offer ends at `endsAt`, first loading, then known. */
function optedIn(endsAt: number) {
  vi.mocked(useExitOfferEndsAt).mockReturnValue(endsAt);
  mock.getItem.mockReturnValue(String(endsAt));
  vi.mocked(useEntitlement).mockReturnValue(entitlement(true));
  vi.mocked(useCurrentUser).mockReturnValue(currentUser(undefined));
  const hook = renderHook(() => useExitOfferReminder());
  const resolve = () => {
    vi.mocked(useEntitlement).mockReturnValue(entitlement(false));
    vi.mocked(useCurrentUser).mockReturnValue(
      currentUser({ _id: "user-a" as Id<"users">, email: undefined }),
    );
    hook.rerender();
  };
  return resolve;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mock.getItem.mockReset().mockReturnValue(null);
  mock.permission.mockReset().mockResolvedValue({ ios: { status: 2 } });
  mock.schedule.mockReset();
  mock.cancel.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useExitOfferReminder", () => {
  it("does not cancel a due reminder while the account is still loading", async () => {
    // Cold launch 30 seconds before the reminder fires.
    const resolve = optedIn(now + HOUR + 30_000);
    await vi.runAllTimersAsync();
    expect(mock.cancel).not.toHaveBeenCalled();
    resolve();
    await vi.runAllTimersAsync();
    expect(mock.cancel).not.toHaveBeenCalled();
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("schedules once the account is known and the offer has time left", async () => {
    const resolve = optedIn(now + 24 * HOUR);
    await vi.runAllTimersAsync();
    expect(mock.cancel).not.toHaveBeenCalled();
    resolve();
    await vi.runAllTimersAsync();
    expect(mock.cancel).toHaveBeenCalledTimes(1);
    expect(mock.schedule).toHaveBeenCalledTimes(1);
    expect(mock.schedule.mock.calls[0][0].trigger.date.getTime()).toBe(
      now + 23 * HOUR,
    );
  });
});
