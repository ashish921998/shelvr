import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelExitOfferReminder, forgetExitOffer } from "./forget-exit-offer";

const mock = vi.hoisted(() => ({
  cancel: vi.fn(async (_id: string) => {}),
  remove: vi.fn(async (_key: string) => {}),
}));
vi.mock("expo-notifications", () => ({
  cancelScheduledNotificationAsync: mock.cancel,
}));
vi.mock("expo-secure-store", () => ({ deleteItemAsync: mock.remove }));
vi.mock("@/lib/current-user", () => ({ useCurrentUser: () => ({}) }));

beforeEach(() => vi.clearAllMocks());

describe("forgetExitOffer", () => {
  it("cancels the device's reminder once, with no account needed", async () => {
    mock.cancel.mockImplementationOnce(() => {
      throw new Error("no native module");
    });
    await expect(cancelExitOfferReminder()).resolves.toBeUndefined();
    await cancelExitOfferReminder();
    expect(mock.cancel).toHaveBeenCalledTimes(1);
    expect(mock.cancel).toHaveBeenCalledWith("shelvr.exit-offer-ending");
  });

  it("deletes the account's keys once", async () => {
    await forgetExitOffer("user_1");
    await forgetExitOffer("user_1");
    expect(mock.remove.mock.calls.map(([key]) => key)).toEqual([
      "shelvr.exitOffer.remind.user_1",
      "shelvr.exitOffer.shownAt.user_1",
    ]);
  });

  it("deletes the second key when the first throws", async () => {
    mock.remove.mockImplementationOnce(() => {
      throw new Error("keychain locked");
    });
    await expect(forgetExitOffer("user_2")).resolves.toBeUndefined();
    expect(mock.remove).toHaveBeenCalledTimes(2);
  });
});
