import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgetExitOffer } from "./forget-exit-offer";

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
  it("cancels the reminder and deletes the account's keys once", async () => {
    await forgetExitOffer("user_1");
    await forgetExitOffer("user_1");
    expect(mock.cancel).toHaveBeenCalledTimes(1);
    expect(mock.cancel).toHaveBeenCalledWith("shelvr.exit-offer-ending");
    expect(mock.remove.mock.calls.map(([key]) => key)).toEqual([
      "shelvr.exitOffer.remind.user_1",
      "shelvr.exitOffer.shownAt.user_1",
    ]);
  });

  it("deletes the keys even when cancelling throws", async () => {
    mock.cancel.mockImplementationOnce(() => {
      throw new Error("no native module");
    });
    await expect(forgetExitOffer("user_2")).resolves.toBeUndefined();
    expect(mock.remove).toHaveBeenCalledTimes(2);
  });
});
