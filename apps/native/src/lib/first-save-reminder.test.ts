import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearFirstSaveReminder,
  FIRST_SAVE_REMINDER_ID,
} from "./first-save-reminder";

const notifications = vi.hoisted(() => ({
  cancel: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("expo-notifications", () => ({
  cancelScheduledNotificationAsync: notifications.cancel,
  dismissNotificationAsync: notifications.dismiss,
}));

beforeEach(() => vi.clearAllMocks());

describe("clearFirstSaveReminder", () => {
  it("cancels the scheduled reminder and removes a delivered one", async () => {
    await clearFirstSaveReminder();
    expect(notifications.cancel).toHaveBeenCalledWith(FIRST_SAVE_REMINDER_ID);
    expect(notifications.dismiss).toHaveBeenCalledWith(FIRST_SAVE_REMINDER_ID);
  });

  it("still dismisses a delivered reminder when the cancel fails", async () => {
    notifications.cancel.mockRejectedValueOnce(new Error("no"));
    await expect(clearFirstSaveReminder()).resolves.toBeUndefined();
    expect(notifications.dismiss).toHaveBeenCalledWith(FIRST_SAVE_REMINDER_ID);
  });
});
