import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXIT_OFFER_REMINDER_ID,
  syncExitOfferReminder,
} from "./exit-offer-reminder";

const mock = vi.hoisted(() => ({
  permission: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: vi.fn() }));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: vi.fn(),
  useExitOfferEndsAt: vi.fn(),
  waitForSheetTransition: vi.fn(),
}));
vi.mock("@convex/_generated/api", () => ({ api: { notifications: {} } }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));
vi.mock("expo-secure-store", () => ({ getItem: vi.fn(), setItem: vi.fn() }));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  getPermissionsAsync: mock.permission,
  scheduleNotificationAsync: mock.schedule,
  cancelScheduledNotificationAsync: mock.cancel,
}));

const HOUR = 60 * 60 * 1000;
const now = 1_000_000_000_000;

beforeEach(() => {
  mock.permission.mockReset().mockResolvedValue({ ios: { status: 2 } });
  mock.schedule.mockReset();
  mock.cancel.mockReset();
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

  it("clears the reminder once the offer is gone or nearly over", async () => {
    await expect(syncExitOfferReminder(null, now)).resolves.toBe(false);
    await expect(syncExitOfferReminder(now + 30 * 60_000, now)).resolves.toBe(
      false,
    );
    expect(mock.cancel).toHaveBeenCalledWith(EXIT_OFFER_REMINDER_ID);
    expect(mock.schedule).not.toHaveBeenCalled();
  });
});
