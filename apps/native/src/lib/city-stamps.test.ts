// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyCityStampChange,
  useCityStampAccess,
  useCityStampToggle,
  useRemoveCityStamp,
} from "@/lib/city-stamps";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  openPaywall: vi.fn(),
  guard: vi.fn(),
  entitlement: { entitled: false, loading: false },
  alert: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  play: vi.fn(),
  router: { push: vi.fn() },
}));

vi.mock("convex/react", () => ({
  useMutation: (ref: Parameters<typeof getFunctionName>[0]) => {
    const run = getFunctionName(ref).endsWith("addCityStamp")
      ? mocks.add
      : mocks.remove;
    return { withOptimisticUpdate: () => run };
  },
}));
vi.mock("expo-router", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/entitlement", () => ({
  openPaywall: mocks.openPaywall,
  useEntitlement: () => mocks.entitlement,
  usePaywallGuard: () => ({ guard: mocks.guard }),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/stamp-moment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stamp-moment")>()),
  useStampMoment: () => ({ play: mocks.play }),
}));
vi.mock("@/lib/city-stamp-data", () => ({
  cityStampLabel: (city: string) => `label:${city}`,
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));

async function toggle(city: "lisbon" | "tokyo", stamped: boolean) {
  const { result } = renderHook(() => useCityStampToggle());
  let done = false;
  await act(async () => {
    done = await result.current(city, stamped, stamped ? 3 : 1);
  });
  return done;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.add.mockResolvedValue(true);
  mocks.remove.mockResolvedValue(true);
  mocks.entitlement = { entitled: false, loading: false };
});

describe("useCityStampToggle", () => {
  it("plays the stamp moment when a city is stamped", async () => {
    expect(await toggle("lisbon", true)).toBe(true);
    expect(mocks.add).toHaveBeenCalledWith({ city: "lisbon" });
    expect(mocks.play).toHaveBeenCalledWith(
      { kind: "city", city: "label:lisbon", cover: null },
      "city_stamps",
    );
    expect(mocks.capture).toHaveBeenCalledWith("passport_city_stamp_changed", {
      stamped: true,
      count: 3,
    });
  });

  it("plays nothing when the city was already stamped", async () => {
    mocks.add.mockResolvedValue(false);
    expect(await toggle("lisbon", true)).toBe(true);
    expect(mocks.play).not.toHaveBeenCalled();
  });

  it("plays nothing when a city stamp is removed", async () => {
    expect(await toggle("tokyo", false)).toBe(true);
    expect(mocks.remove).toHaveBeenCalledWith({ city: "tokyo" });
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.play).not.toHaveBeenCalled();
  });

  it("opens the paywall when the server says Pro is needed", async () => {
    mocks.add.mockRejectedValue(
      new ConvexError({ code: "pro_required", message: "Pro required" }),
    );
    expect(await toggle("lisbon", true)).toBe(false);
    expect(mocks.openPaywall).toHaveBeenCalledWith(mocks.router, "passport");
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it("reports any other failure and says so", async () => {
    mocks.add.mockRejectedValue(new Error("offline"));
    expect(await toggle("lisbon", true)).toBe(false);
    expect(mocks.captureError).toHaveBeenCalledWith(
      "city_stamp_update_failed",
      expect.any(Error),
    );
    expect(mocks.alert).toHaveBeenCalledWith(
      "cityStamps.saveFailed",
      "errors.connection",
    );
  });
});

describe("useRemoveCityStamp", () => {
  it("removes the city stamp only once confirmed, with no moment", async () => {
    const { result } = renderHook(() => useRemoveCityStamp());
    result.current("lisbon", 0);
    expect(mocks.remove).not.toHaveBeenCalled();
    const buttons = mocks.alert.mock.calls[0][2] as {
      style: string;
      onPress?: () => void;
    }[];
    await act(async () => {
      buttons.find((button) => button.style === "destructive")?.onPress?.();
    });
    expect(mocks.remove).toHaveBeenCalledWith({ city: "lisbon" });
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith("passport_city_stamp_changed", {
      stamped: false,
      count: 0,
    });
  });
});

describe("useCityStampAccess", () => {
  it("sends a free user to the paywall from the passport", () => {
    const { result } = renderHook(() => useCityStampAccess(2));
    expect(result.current.locked).toBe(true);
    result.current.open();
    expect(mocks.capture).toHaveBeenCalledWith("passport_paywall_opened", {
      surface: "city_stamp",
    });
    expect(mocks.guard).toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("opens the city grid for Pro", () => {
    mocks.entitlement = { entitled: true, loading: false };
    const { result } = renderHook(() => useCityStampAccess(2));
    expect(result.current.locked).toBe(false);
    result.current.open();
    expect(mocks.capture).toHaveBeenCalledWith("passport_city_stamps_opened", {
      count: 2,
    });
    expect(mocks.router.push).toHaveBeenCalledWith("/city-stamps");
    expect(mocks.guard).not.toHaveBeenCalled();
  });
});

describe("applyCityStampChange", () => {
  it("adds a known city in order and removes one", () => {
    const tokyo = { city: "tokyo", country: "JP", stampedAt: 1 };
    expect(applyCityStampChange([tokyo], "lisbon", true, 9)).toEqual([
      { city: "lisbon", country: "PT", stampedAt: 9 },
      tokyo,
    ]);
    expect(applyCityStampChange([tokyo], "tokyo", false, 9)).toEqual([]);
    expect(applyCityStampChange([tokyo], "atlantis", true, 9)).toEqual([tokyo]);
  });
});
