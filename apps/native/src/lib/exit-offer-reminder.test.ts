import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXIT_OFFER_REMINDER_ID,
  clearExitOfferReminder,
  optInToExitOfferReminder,
  optOutOfExitOfferReminder,
  syncExitOfferReminder,
} from "./exit-offer-reminder";

const mock = vi.hoisted(() => ({
  permission: vi.fn(),
  request: vi.fn(),
  setItem: vi.fn(),
  deleteItem: vi.fn(),
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
  waitForSheetTransition: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({
  getItem: vi.fn(),
  setItem: mock.setItem,
  deleteItemAsync: mock.deleteItem,
}));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  getPermissionsAsync: mock.permission,
  requestPermissionsAsync: mock.request,
  scheduleNotificationAsync: mock.schedule,
  cancelScheduledNotificationAsync: mock.cancel,
}));

const HOUR = 60 * 60 * 1000;
const now = 1_000_000_000_000;

beforeEach(() => {
  mock.permission.mockReset().mockResolvedValue({ ios: { status: 2 } });
  mock.request.mockReset();
  mock.setItem.mockReset();
  mock.deleteItem.mockReset().mockResolvedValue(undefined);
  mock.schedule.mockReset();
  mock.cancel.mockReset();
});

describe("optInToExitOfferReminder", () => {
  it("records the opt-in for this offer window", async () => {
    await expect(
      optInToExitOfferReminder("user1", now + 24 * HOUR),
    ).resolves.toBe(true);
    expect(mock.setItem).toHaveBeenCalledWith(
      "shelvr.exitOffer.remind.user1",
      String(now + 24 * HOUR),
    );
    expect(mock.request).not.toHaveBeenCalled();
  });

  it("asks for permission only in answer to the tap", async () => {
    mock.permission.mockResolvedValue({
      ios: { status: 1 },
      canAskAgain: true,
    });
    mock.request.mockResolvedValue({ ios: { status: 2 } });
    await expect(
      optInToExitOfferReminder("user1", now + 24 * HOUR),
    ).resolves.toBe(true);
    expect(mock.request).toHaveBeenCalledTimes(1);
  });

  it("records nothing when notifications stay off", async () => {
    mock.permission.mockResolvedValue({
      ios: { status: 1 },
      canAskAgain: true,
    });
    mock.request.mockResolvedValue({ ios: { status: 1 } });
    await expect(
      optInToExitOfferReminder("user1", now + 24 * HOUR),
    ).resolves.toBe(false);
    expect(mock.setItem).not.toHaveBeenCalled();
  });
});

describe("optOutOfExitOfferReminder", () => {
  it("cancels the reminder and forgets the opt-in", async () => {
    await optOutOfExitOfferReminder("user1");
    expect(mock.cancel).toHaveBeenCalledWith(EXIT_OFFER_REMINDER_ID);
    expect(mock.deleteItem).toHaveBeenCalledWith(
      "shelvr.exitOffer.remind.user1",
    );
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("still opts out when the stored opt-in cannot be deleted", async () => {
    mock.deleteItem.mockRejectedValue(new Error("keychain"));
    await optOutOfExitOfferReminder("user1");
    expect(mock.cancel).toHaveBeenCalledWith(EXIT_OFFER_REMINDER_ID);
    expect(mock.setItem).toHaveBeenCalledWith(
      "shelvr.exitOffer.remind.user1",
      "0",
    );
  });
});

describe("syncExitOfferReminder", () => {
  it("reminds an hour before the offer closes", async () => {
    await expect(syncExitOfferReminder(now + 24 * HOUR, now)).resolves.toBe(
      true,
    );
    const [request] = mock.schedule.mock.calls[0];
    expect(request.identifier).toBe(EXIT_OFFER_REMINDER_ID);
    expect(request.trigger.date.getTime()).toBe(now + 23 * HOUR);
    expect(request.content.data).toEqual({
      url: "/",
      kind: "exit_offer_reminder",
    });
  });

  it("never asks for permission", async () => {
    mock.permission.mockResolvedValue({ ios: { status: 1 } });
    await expect(syncExitOfferReminder(now + 24 * HOUR, now)).resolves.toBe(
      false,
    );
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("clears the reminder once the offer is gone", async () => {
    await expect(syncExitOfferReminder(null, now)).resolves.toBe(false);
    await expect(syncExitOfferReminder(now - 1, now)).resolves.toBe(false);
    expect(mock.cancel).toHaveBeenCalledTimes(2);
    expect(mock.cancel).toHaveBeenCalledWith(EXIT_OFFER_REMINDER_ID);
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("leaves a reminder alone once it is due within a minute", async () => {
    // Opening the app just before the reminder fires must not cancel it.
    await expect(syncExitOfferReminder(now + HOUR + 30_000, now)).resolves.toBe(
      false,
    );
    await expect(syncExitOfferReminder(now + 30 * 60_000, now)).resolves.toBe(
      false,
    );
    expect(mock.cancel).not.toHaveBeenCalled();
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("does not schedule a reminder cancelled while it waited", async () => {
    await expect(
      syncExitOfferReminder(now + 24 * HOUR, now, () => false),
    ).resolves.toBe(false);
    expect(mock.cancel).toHaveBeenCalledWith(EXIT_OFFER_REMINDER_ID);
    expect(mock.schedule).not.toHaveBeenCalled();
  });
});

describe("clearExitOfferReminder", () => {
  it("cancels the scheduled reminder when the session ends", async () => {
    await clearExitOfferReminder();
    expect(mock.cancel).toHaveBeenCalledWith(EXIT_OFFER_REMINDER_ID);
    expect(mock.schedule).not.toHaveBeenCalled();
  });

  it("forgets an opt-in still waiting on permission", async () => {
    let grant: (value: unknown) => void = () => {};
    mock.permission.mockResolvedValue({
      ios: { status: 1 },
      canAskAgain: true,
    });
    mock.request.mockReturnValue(new Promise((resolve) => (grant = resolve)));
    const pending = optInToExitOfferReminder("user1", now + 24 * HOUR);
    await vi.waitFor(() => expect(mock.request).toHaveBeenCalled());
    await clearExitOfferReminder();
    grant({ ios: { status: 2 } });
    await expect(pending).resolves.toBe(false);
    expect(mock.setItem).not.toHaveBeenCalled();
  });
});
