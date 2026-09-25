import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  scheduleTrialReminder,
  TRIAL_REMINDER_ID,
  trialReminderAt,
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
        content: expect.objectContaining({ data: { url: "/profile" } }),
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
    expect(mock.cancel).toHaveBeenLastCalledWith(TRIAL_REMINDER_ID);
  });
});
