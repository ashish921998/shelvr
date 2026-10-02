// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { useCurrentUser } from "@/lib/current-user";
import { useEntitlement } from "@/lib/entitlement";
import { trialReminderPrimer, useTrialReminder } from "./trial-reminder";

/**
 * The hook under a DOM, for what the primer adds between a trial starting and
 * the OS prompt: a declined primer never prompts, an accepted one does, and a
 * trial that ends while the primer is open closes it without prompting.
 */

const mock = vi.hoisted(() => ({
  permission: vi.fn(),
  request: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({
  api: { notifications: { getPreferences: "getPreferences" } },
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn(() => ({})) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { remindersEnabled: true, timezone: "UTC" },
    isError: false,
  }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: vi.fn(),
  waitForSheetTransition: () => Promise.resolve(),
}));
vi.mock("expo-secure-store", () => ({ getItem: () => null, setItem: vi.fn() }));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  setNotificationChannelAsync: vi.fn(),
  getPermissionsAsync: mock.permission,
  requestPermissionsAsync: mock.request,
  scheduleNotificationAsync: mock.schedule,
  cancelScheduledNotificationAsync: mock.cancel,
  dismissNotificationAsync: vi.fn(),
}));

const DAY = 24 * 60 * 60 * 1000;
const granted = { granted: true, canAskAgain: true, ios: { status: 2 } };
const undetermined = { granted: false, canAskAgain: true, ios: { status: 0 } };

type Entitlement = ReturnType<typeof useEntitlement>;
type CurrentUser = ReturnType<typeof useCurrentUser>;

function entitled(status: "none" | "trialing"): Entitlement {
  return {
    status,
    entitled: status === "trialing",
    loading: false,
    expiresAt: status === "trialing" ? Date.now() + 7 * DAY : undefined,
  } as Entitlement;
}

/** Renders the hook for a signed-in account, then starts a trial. */
function startTrial() {
  vi.mocked(useCurrentUser).mockReturnValue({
    data: { _id: "user-a" as Id<"users">, email: undefined },
  } as CurrentUser);
  vi.mocked(useEntitlement).mockReturnValue(entitled("none"));
  const hook = renderHook(() => useTrialReminder());
  vi.mocked(useEntitlement).mockReturnValue(entitled("trialing"));
  hook.rerender();
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  trialReminderPrimer.answer(false);
  mock.permission.mockResolvedValue(undetermined);
  mock.request.mockResolvedValue(granted);
});

describe("useTrialReminder primer", () => {
  it("never prompts after the primer is declined", async () => {
    startTrial();
    await vi.waitFor(() => expect(trialReminderPrimer.isOpen()).toBe(true));
    act(() => trialReminderPrimer.answer(false));
    await vi.waitFor(() => expect(mock.permission).toHaveBeenCalledTimes(2));
    expect(mock.request).not.toHaveBeenCalled();
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("prompts and schedules the reminder after the primer is accepted", async () => {
    startTrial();
    await vi.waitFor(() => expect(trialReminderPrimer.isOpen()).toBe(true));
    act(() => trialReminderPrimer.answer(true));
    await vi.waitFor(() => expect(mock.schedule).toHaveBeenCalled());
    expect(mock.request).toHaveBeenCalledTimes(1);
  });

  it("closes the primer without prompting when the trial ends", async () => {
    const hook = startTrial();
    await vi.waitFor(() => expect(trialReminderPrimer.isOpen()).toBe(true));
    vi.mocked(useEntitlement).mockReturnValue(entitled("none"));
    hook.rerender();
    expect(trialReminderPrimer.isOpen()).toBe(false);
    await vi.waitFor(() => expect(mock.cancel).toHaveBeenCalled());
    expect(mock.request).not.toHaveBeenCalled();
    expect(mock.schedule).not.toHaveBeenCalled();
  });
});
