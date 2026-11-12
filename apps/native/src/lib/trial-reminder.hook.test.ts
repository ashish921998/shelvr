// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { useCurrentUser } from "@/lib/current-user";
import { useEntitlement } from "@/lib/entitlement";
import { takeSheetTurn } from "./one-time-sheets";
import { trialReminderPrimer, useTrialReminder } from "./trial-reminder";

const mock = vi.hoisted(() => ({
  permission: vi.fn(),
  request: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  remindersEnabled: true,
  transition: vi.fn(() => Promise.resolve()),
  settled: vi.fn(() => Promise.resolve()),
  useEntitlement: vi.fn(),
  useCurrentUser: vi.fn(),
  secure: new Map<string, string>(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: mock.useCurrentUser }));
vi.mock("@convex/_generated/api", () => ({
  api: { notifications: { getPreferences: "getPreferences" } },
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn(() => ({})) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { remindersEnabled: mock.remindersEnabled, timezone: "UTC" },
    isError: false,
  }),
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: mock.useEntitlement,
  waitForSheetTransition: () => mock.transition(),
  whenSheetSettled: () => mock.settled(),
}));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => mock.secure.get(key) ?? null,
  setItem: (key: string, value: string) => mock.secure.set(key, value),
}));
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

function startTrial(useHook = useTrialReminder) {
  vi.mocked(useCurrentUser).mockReturnValue({
    data: { _id: "user-a" as Id<"users">, email: undefined },
  } as CurrentUser);
  vi.mocked(useEntitlement).mockReturnValue(entitled("none"));
  const hook = renderHook(() => useHook());
  vi.mocked(useEntitlement).mockReturnValue(entitled("trialing"));
  hook.rerender();
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.secure.clear();
  mock.remindersEnabled = true;
  trialReminderPrimer.dismiss();
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

  it("keeps the primer answer when reminder preferences change", async () => {
    const hook = startTrial();
    await vi.waitFor(() => expect(trialReminderPrimer.isOpen()).toBe(true));
    mock.remindersEnabled = false;
    hook.rerender();
    expect(trialReminderPrimer.isOpen()).toBe(true);
    act(() => trialReminderPrimer.answer(true));
    await vi.waitFor(() => expect(mock.schedule).toHaveBeenCalled());
    expect(mock.request).toHaveBeenCalledTimes(1);
  });

  it("holds the next sheet's turn until the primer is answered", async () => {
    startTrial();
    const letter = takeSheetTurn("letter");
    let done = false;
    void letter.granted.then(() => {
      done = true;
    });
    await vi.waitFor(() => expect(trialReminderPrimer.isOpen()).toBe(true));
    expect(done).toBe(false);
    act(() => trialReminderPrimer.answer(false));
    await vi.waitFor(() => expect(done).toBe(true));
    letter.end();
  });

  it("never opens the primer when the trial ends while permission is read", async () => {
    let resolvePermission: (value: typeof undetermined) => void = () => {};
    mock.permission.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePermission = resolve;
      }),
    );
    const hook = startTrial();
    await vi.waitFor(() => expect(mock.permission).toHaveBeenCalled());
    vi.mocked(useEntitlement).mockReturnValue(entitled("none"));
    hook.rerender();
    await act(async () => resolvePermission(undetermined));
    await vi.waitFor(() => expect(mock.cancel).toHaveBeenCalled());
    expect(trialReminderPrimer.isOpen()).toBe(false);
    expect(mock.request).not.toHaveBeenCalled();
  });

  it("holds a late caller until the declined primer has slid away", async () => {
    startTrial();
    await vi.waitFor(() => expect(trialReminderPrimer.isOpen()).toBe(true));
    const letter = takeSheetTurn("letter");
    let done = false;
    void letter.granted.then(() => {
      done = true;
    });
    let slid: () => void = () => {};
    mock.settled.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        slid = resolve;
      }),
    );
    act(() => trialReminderPrimer.answer(false));
    await vi.waitFor(() => expect(mock.settled).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(done).toBe(false);
    await act(async () => slid());
    await vi.waitFor(() => expect(done).toBe(true));
    letter.end();
  });

  it("asks on the next launch when the app closed while the primer waited for its turn", async () => {
    vi.resetModules();
    const sheets = await import("./one-time-sheets");
    const first = await import("./trial-reminder");
    await sheets.takeSheetTurn("letter").granted;
    startTrial(first.useTrialReminder);
    await act(async () => {});
    expect(first.trialReminderPrimer.isOpen()).toBe(false);

    vi.resetModules();
    const next = await import("./trial-reminder");
    renderHook(() => next.useTrialReminder());
    await vi.waitFor(() =>
      expect(next.trialReminderPrimer.isOpen()).toBe(true),
    );
    act(() => next.trialReminderPrimer.answer(false));
  });

  it("drops an owed primer that comes back too late for its reminder", async () => {
    mock.secure.set("shelvr.trialReminderAsked.user-a", "owed");
    vi.mocked(useCurrentUser).mockReturnValue({
      data: { _id: "user-a" as Id<"users">, email: undefined },
    } as CurrentUser);
    vi.mocked(useEntitlement).mockReturnValue({
      ...entitled("trialing"),
      expiresAt: Date.now() + 20 * 60 * 60 * 1000,
    });
    renderHook(() => useTrialReminder());
    await vi.waitFor(() => expect(mock.settled).toHaveBeenCalled());
    for (let round = 0; round < 5; round += 1) await act(async () => {});
    expect(trialReminderPrimer.isOpen()).toBe(false);
    expect(mock.request).not.toHaveBeenCalled();
  });

  it("drops an owed primer once its reminder is no longer about five days away", async () => {
    mock.secure.set("shelvr.trialReminderAsked.user-a", "owed");
    vi.mocked(useCurrentUser).mockReturnValue({
      data: { _id: "user-a" as Id<"users">, email: undefined },
    } as CurrentUser);
    vi.mocked(useEntitlement).mockReturnValue({
      ...entitled("trialing"),
      expiresAt: Date.now() + 4 * DAY,
    });
    renderHook(() => useTrialReminder());
    await vi.waitFor(() => expect(mock.settled).toHaveBeenCalled());
    for (let round = 0; round < 5; round += 1) await act(async () => {});
    expect(trialReminderPrimer.isOpen()).toBe(false);
    expect(mock.request).not.toHaveBeenCalled();
  });

  it("does not ask again on the next launch once the primer was shown", async () => {
    vi.resetModules();
    const first = await import("./trial-reminder");
    startTrial(first.useTrialReminder);
    await vi.waitFor(() =>
      expect(first.trialReminderPrimer.isOpen()).toBe(true),
    );
    act(() => first.trialReminderPrimer.answer(false));
    await vi.waitFor(() => expect(mock.permission).toHaveBeenCalledTimes(2));

    vi.resetModules();
    const next = await import("./trial-reminder");
    renderHook(() => next.useTrialReminder());
    await vi.waitFor(() => expect(mock.permission).toHaveBeenCalledTimes(3));
    await act(async () => {});
    expect(next.trialReminderPrimer.isOpen()).toBe(false);
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
