// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  store: new Map<string, string>(),
  keychainFailing: false,
  readFailing: false,
  authenticated: true,
  onboarded: true,
  user: { _id: "user-1" } as { _id: string } | null,
  update: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => {
    if (mock.readFailing) throw new Error("keychain locked");
    return mock.store.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    if (mock.keychainFailing) throw new Error("keychain unavailable");
    mock.store.set(key, value);
  },
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    cityStamps: { claimOnboardingCityStamps: "claimOnboardingCityStamps" },
  },
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mock.authenticated }),
  useMutation: () => mock.update,
}));
vi.mock("@/lib/current-user", () => ({
  useCurrentUser: () => ({ data: mock.user }),
}));
vi.mock("@/lib/onboarding", () => ({
  useOnboarding: () => ({ onboarded: mock.onboarded }),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: mock.captureError },
}));

const { clearQueuedCityStamps, queueCityStamps, useSyncPendingCityStamps } =
  await import("./pending-city-stamps");

const KEY = "shelvr.onboarding.cityStamps";
const slot = () => mock.store.get(KEY);
const stored = (value: unknown) => mock.store.set(KEY, JSON.stringify(value));

async function mount() {
  const hook = renderHook(() => useSyncPendingCityStamps());
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
  return hook;
}

beforeEach(() => {
  mock.store.clear();
  mock.keychainFailing = false;
  mock.readFailing = false;
  mock.authenticated = true;
  mock.onboarded = true;
  mock.user = { _id: "user-1" };
  mock.update.mockReset().mockResolvedValue(2);
  mock.capture.mockReset();
  mock.captureError.mockReset();
});

describe("the cities picked in onboarding, before sign-in", () => {
  it("are queued without an owner, and an empty pick clears the slot", () => {
    queueCityStamps(["lisbon", "madrid"]);
    expect(JSON.parse(slot() ?? "")).toEqual({
      cities: ["lisbon", "madrid"],
      owner: null,
    });
    queueCityStamps([]);
    expect(slot()).toBe("");
    stored({ cities: ["tokyo"], owner: null });
    clearQueuedCityStamps();
    expect(slot()).toBe("");
  });

  it("report a keychain that will not take them", () => {
    mock.keychainFailing = true;
    queueCityStamps(["lisbon"]);
    clearQueuedCityStamps();
    expect(mock.captureError).toHaveBeenCalledWith(
      "queue_city_stamps_failed",
      expect.any(Error),
    );
    expect(mock.captureError).toHaveBeenCalledWith(
      "clear_city_stamps_failed",
      expect.any(Error),
    );
  });

  it("are saved to the account once it signs in, and the slot is cleared", async () => {
    queueCityStamps(["lisbon", "madrid"]);
    await mount();
    expect(mock.update).toHaveBeenCalledWith({ cities: ["lisbon", "madrid"] });
    expect(mock.capture).toHaveBeenCalledWith("passport_city_stamps_claimed", {
      picked: 2,
      stamped: 2,
    });
    expect(slot()).toBe("");
  });

  it("claim the slot for the account before sending", async () => {
    queueCityStamps(["lisbon"]);
    mock.update.mockReturnValue(new Promise(() => {}));
    await mount();
    expect(JSON.parse(slot() ?? "")).toEqual({
      cities: ["lisbon"],
      owner: "user-1",
    });
  });

  it.each([
    ["garbage", "{broken"],
    ["an empty list", JSON.stringify({ cities: [], owner: null })],
    ["unknown cities", JSON.stringify({ cities: ["atlantis"], owner: null })],
    ["no list", JSON.stringify({ owner: null })],
  ])("send nothing for %s", async (_name, raw) => {
    mock.store.set(KEY, raw);
    await mount();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("drop unknown and repeated cities before sending", async () => {
    stored({ cities: ["madrid", "atlantis", "lisbon", "lisbon"], owner: null });
    await mount();
    expect(mock.update).toHaveBeenCalledWith({ cities: ["lisbon", "madrid"] });
  });

  it("wait for sign-in, the account and the end of onboarding", async () => {
    queueCityStamps(["lisbon"]);
    mock.authenticated = false;
    const hook = await mount();
    mock.authenticated = true;
    mock.user = null;
    hook.rerender();
    mock.user = { _id: "user-1" };
    mock.onboarded = false;
    hook.rerender();
    await act(async () => {});
    expect(mock.update).not.toHaveBeenCalled();
    mock.onboarded = true;
    hook.rerender();
    await act(async () => {});
    expect(mock.update).toHaveBeenCalledOnce();
  });

  it("never reach another account, whose slot is cleared", async () => {
    stored({ cities: ["lisbon"], owner: "user-2" });
    await mount();
    expect(mock.update).not.toHaveBeenCalled();
    expect(slot()).toBe("");
  });

  it("stay queued after a failed save, and go on the next launch", async () => {
    const error = new Error("offline");
    mock.update.mockRejectedValue(error);
    queueCityStamps(["lisbon"]);
    await mount();
    expect(mock.captureError).toHaveBeenCalledWith(
      "city_stamps_claim_failed",
      error,
    );
    expect(JSON.parse(slot() ?? "").owner).toBe("user-1");
    expect(mock.capture).not.toHaveBeenCalled();

    mock.update.mockReset().mockResolvedValue(2);
    await mount();
    expect(mock.update).toHaveBeenCalledWith({ cities: ["lisbon"] });
    expect(slot()).toBe("");
  });

  it("are not sent when the keychain will not take the claim", async () => {
    queueCityStamps(["lisbon"]);
    mock.keychainFailing = true;
    await mount();
    expect(mock.captureError).toHaveBeenCalledWith(
      "claim_city_stamps_failed",
      expect.any(Error),
    );
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("keep a newer pick queued while an earlier claim was still saving", async () => {
    let finish: (stamped: number) => void = () => {};
    mock.update.mockReturnValue(
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    );
    queueCityStamps(["lisbon"]);
    await mount();
    queueCityStamps(["tokyo"]);
    await act(async () => {
      finish(1);
      await Promise.resolve();
    });
    expect(JSON.parse(slot() ?? "")).toEqual({
      cities: ["tokyo"],
      owner: null,
    });
  });

  it("report a keychain that cannot be read, and send nothing", async () => {
    queueCityStamps(["lisbon"]);
    mock.readFailing = true;
    await mount();
    expect(mock.captureError).toHaveBeenCalledWith(
      "read_city_stamps_failed",
      expect.any(Error),
    );
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("go once per account in one mount, and still reach a second account", async () => {
    mock.update.mockRejectedValue(new Error("offline"));
    queueCityStamps(["lisbon"]);
    const hook = await mount();
    mock.onboarded = false;
    hook.rerender();
    mock.onboarded = true;
    hook.rerender();
    await act(async () => {});
    expect(mock.update).toHaveBeenCalledOnce();

    mock.update.mockReset().mockResolvedValue(2);
    queueCityStamps(["tokyo"]);
    mock.user = { _id: "user-2" };
    hook.rerender();
    await act(async () => {});
    expect(mock.update).toHaveBeenCalledWith({ cities: ["tokyo"] });
  });
});
