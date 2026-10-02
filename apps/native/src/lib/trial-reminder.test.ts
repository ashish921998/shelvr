import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmTrialReminderAsk,
  scheduleTrialReminder,
  TRIAL_NUDGES,
  TRIAL_REMINDER_ID,
  trialNudgeAt,
  trialNudgesAllowed,
  trialReminderAt,
  trialReminderPrimer,
} from "./trial-reminder";

const mock = vi.hoisted(() => ({
  platform: { OS: "ios" },
  channel: vi.fn(),
  permission: vi.fn(),
  request: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: mock.platform }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: vi.fn() },
}));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: vi.fn() }));
vi.mock("@convex/_generated/api", () => ({ api: {} }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: vi.fn(),
  waitForSheetTransition: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  setNotificationChannelAsync: mock.channel,
  getPermissionsAsync: mock.permission,
  requestPermissionsAsync: mock.request,
  scheduleNotificationAsync: mock.schedule,
  cancelScheduledNotificationAsync: mock.cancel,
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const granted = { granted: true, canAskAgain: true, ios: { status: 2 } };
const undetermined = { granted: false, canAskAgain: true, ios: { status: 0 } };

beforeEach(() => {
  vi.clearAllMocks();
  mock.platform.OS = "ios";
  mock.permission.mockResolvedValue(granted);
});

describe("trialReminderAt", () => {
  it("fires two days before the trial ends", () => {
    expect(trialReminderAt(NOW + 7 * DAY, NOW)).toBe(NOW + 5 * DAY);
  });

  it("skips a trial that ends within two days", () => {
    expect(trialReminderAt(NOW + 2 * DAY, NOW)).toBeNull();
    expect(trialReminderAt(NOW + DAY, NOW)).toBeNull();
  });
});

describe("scheduleTrialReminder", () => {
  it("replaces the reminder at the right time when permission is granted", async () => {
    expect(await scheduleTrialReminder(NOW + 7 * DAY, NOW, false)).toBe(true);
    expect(mock.request).not.toHaveBeenCalled();
    expect(mock.cancel).toHaveBeenCalledWith(TRIAL_REMINDER_ID);
    expect(mock.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: TRIAL_REMINDER_ID,
        content: expect.objectContaining({
          data: {
            url: "/profile",
            kind: "trial_reminder",
            notificationId: TRIAL_REMINDER_ID,
          },
        }),
        trigger: expect.objectContaining({ date: new Date(NOW + 5 * DAY) }),
      }),
    );
  });

  it("never prompts for a trial that was already running", async () => {
    mock.permission.mockResolvedValue(undetermined);
    expect(await scheduleTrialReminder(NOW + 7 * DAY, NOW, false)).toBe(false);
    expect(mock.request).not.toHaveBeenCalled();
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("asks once when a trial has just started", async () => {
    mock.permission.mockResolvedValue(undetermined);
    mock.request.mockResolvedValue(granted);
    expect(await scheduleTrialReminder(NOW + 7 * DAY, NOW, true)).toBe(true);
    expect(mock.request).toHaveBeenCalledTimes(1);
    expect(mock.capture).toHaveBeenCalledWith("trial_reminder_permission", {
      granted: true,
    });
    expect(mock.schedule).toHaveBeenCalledTimes(1);
  });

  it("creates the Android channel before asking", async () => {
    mock.platform.OS = "android";
    mock.permission.mockResolvedValue({ granted: false, canAskAgain: true });
    mock.request.mockResolvedValue({ granted: true });
    await scheduleTrialReminder(NOW + 7 * DAY, NOW, true);
    expect(mock.channel).toHaveBeenCalledBefore(mock.request);
  });

  it("clears the reminder when the trial ends too soon", async () => {
    expect(await scheduleTrialReminder(NOW + DAY, NOW, true)).toBe(false);
    expect(mock.cancel).toHaveBeenCalledWith(TRIAL_REMINDER_ID);
    expect(mock.request).not.toHaveBeenCalled();
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("schedules nothing when the trial ends during the permission prompt", async () => {
    let current = true;
    mock.permission.mockResolvedValue(undetermined);
    mock.request.mockImplementation(async () => {
      current = false;
      return granted;
    });
    expect(
      await scheduleTrialReminder(NOW + 7 * DAY, NOW, true, () => current),
    ).toBe(false);
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("removes a reminder that went stale while it was being scheduled", async () => {
    let current = true;
    mock.schedule.mockImplementation(async () => {
      current = false;
    });
    expect(
      await scheduleTrialReminder(NOW + 7 * DAY, NOW, false, () => current),
    ).toBe(false);
    expect(mock.cancel.mock.calls.slice(-3).flat()).toEqual([
      TRIAL_REMINDER_ID,
      ...TRIAL_NUDGES.map((nudge) => nudge.id),
    ]);
  });
});

describe("trial nudges", () => {
  // Local noon, so the nudges keep the trial's hour.
  const noon = new Date(2027, 0, 4, 12, 0, 0, 0).getTime();
  const nudgeIds = TRIAL_NUDGES.map((nudge) => nudge.id);

  it("lands on day 1 and day 3 of the trial", () => {
    const expiresAt = noon + 7 * DAY;
    expect(trialNudgeAt(expiresAt, 1, noon)).toBe(noon + DAY);
    expect(trialNudgeAt(expiresAt, 3, noon)).toBe(noon + 3 * DAY);
  });

  it("moves a nudge out of the night", () => {
    const late = new Date(2027, 0, 4, 23, 30).getTime();
    expect(new Date(trialNudgeAt(late + 7 * DAY, 1, late)!).getHours()).toBe(
      19,
    );
    const early = new Date(2027, 0, 4, 6, 15).getTime();
    const at = new Date(trialNudgeAt(early + 7 * DAY, 1, early)!);
    expect([at.getHours(), at.getMinutes()]).toEqual([10, 0]);
  });

  it("keeps the local date across a DST change", () => {
    // A late-evening trial start in a zone that springs forward that week
    // still lands on the calendar day after.
    const start = new Date(2027, 2, 13, 18, 30).getTime();
    const at = new Date(trialNudgeAt(start + 7 * DAY, 1, start)!);
    expect([at.getMonth(), at.getDate(), at.getHours()]).toEqual([2, 14, 18]);
  });

  it("skips a nudge whose day has passed", () => {
    expect(trialNudgeAt(noon + 5 * DAY, 1, noon)).toBeNull();
  });

  it("follows the Save reminders switch, not a missing preferences row", () => {
    expect(
      trialNudgesAllowed({ remindersEnabled: false, timezone: null }),
    ).toBe(true);
    expect(
      trialNudgesAllowed({ remindersEnabled: true, timezone: "Asia/Kolkata" }),
    ).toBe(true);
    expect(
      trialNudgesAllowed({ remindersEnabled: false, timezone: "Asia/Kolkata" }),
    ).toBe(false);
  });

  it("schedules both nudges with the reminder when allowed", async () => {
    expect(
      await scheduleTrialReminder(noon + 7 * DAY, noon, false, undefined, true),
    ).toBe(true);
    const ids = mock.schedule.mock.calls.map(
      (call) => (call[0] as { identifier: string }).identifier,
    );
    expect(ids).toEqual([TRIAL_REMINDER_ID, ...nudgeIds]);
    expect(mock.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "shelvr.trial-day-1",
        content: expect.objectContaining({
          data: {
            url: "/add",
            kind: "trial_nudge",
            notificationId: "shelvr.trial-day-1",
          },
        }),
        trigger: expect.objectContaining({ date: new Date(noon + DAY) }),
      }),
    );
  });

  it("clears the nudges when they are switched off", async () => {
    await scheduleTrialReminder(noon + 7 * DAY, noon, false);
    expect(mock.schedule).toHaveBeenCalledTimes(1);
    for (const id of nudgeIds) expect(mock.cancel).toHaveBeenCalledWith(id);
  });

  it("schedules no nudges without permission", async () => {
    mock.permission.mockResolvedValue(undetermined);
    await scheduleTrialReminder(noon + 7 * DAY, noon, false, undefined, true);
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("clears nudges on opt-out even without permission", async () => {
    mock.permission.mockResolvedValue(undetermined);
    await scheduleTrialReminder(noon + 7 * DAY, noon, false);
    for (const id of nudgeIds) expect(mock.cancel).toHaveBeenCalledWith(id);
  });
});

describe("trial reminder primer", () => {
  it("skips the primer when permission is already granted", async () => {
    expect(await confirmTrialReminderAsk()).toBe(true);
    expect(trialReminderPrimer.isOpen()).toBe(false);
  });

  it("skips the primer when the OS would show nothing", async () => {
    mock.permission.mockResolvedValue({ ...undetermined, canAskAgain: false });
    expect(await confirmTrialReminderAsk()).toBe(false);
    expect(trialReminderPrimer.isOpen()).toBe(false);
  });

  it("says why before the OS asks, and follows the answer", async () => {
    mock.permission.mockResolvedValue(undetermined);
    const answer = confirmTrialReminderAsk();
    await vi.waitFor(() => expect(trialReminderPrimer.isOpen()).toBe(true));
    trialReminderPrimer.answer(true);
    expect(await answer).toBe(true);
    expect(trialReminderPrimer.isOpen()).toBe(false);
    expect(mock.request).not.toHaveBeenCalled();
    expect(mock.capture).toHaveBeenCalledWith("trial_reminder_primer", {
      outcome: "accepted",
    });
  });

  it("declines an earlier primer when a new one opens", async () => {
    const first = trialReminderPrimer.request();
    const second = trialReminderPrimer.request();
    expect(await first).toBe(false);
    trialReminderPrimer.answer(false);
    expect(await second).toBe(false);
  });
});
