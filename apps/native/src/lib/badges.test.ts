// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBadgeTotals, useBadgeUnlocks, useShareBadge } from "@/lib/badges";
import type { BadgeCity, BadgeStamp } from "@convex/model/badges";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  entitled: true,
  stamps: undefined as BadgeStamp[] | undefined,
  rows: undefined as BadgeCity[] | undefined,
  completionEnabled: [] as boolean[],
  queryArgs: [] as unknown[],
  token: null as string | null,
  os: "ios",
  share: vi.fn(),
  alert: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }),
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_fn: unknown, args: unknown) => args,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (args: unknown) => {
    mocks.queryArgs.push(args);
    return { data: args === "skip" ? undefined : mocks.stamps, error: null };
  },
}));
vi.mock("@/lib/passport", () => ({
  useCityCompletion: (enabled: boolean) => {
    mocks.completionEnabled.push(enabled);
    return { rows: enabled ? mocks.rows : undefined, error: null };
  },
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => ({ entitled: mocks.entitled, loading: false }),
}));
vi.mock("@/lib/passport-share", () => ({
  usePassportShare: () => mocks.token,
  passportUrl: (token: string) => `https://shelvr.test/passport/${token}`,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  Platform: {
    get OS() {
      return mocks.os;
    },
  },
  Share: { share: mocks.share, sharedAction: "sharedAction" },
}));

const cafe = (city: string): BadgeStamp => ({ city, kinds: ["coffee"] });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticated = true;
  mocks.entitled = true;
  mocks.stamps = [];
  mocks.rows = [];
  mocks.completionEnabled = [];
  mocks.queryArgs = [];
  mocks.token = null;
  mocks.os = "ios";
  mocks.share.mockResolvedValue({ action: "sharedAction" });
});

describe("useBadgeTotals", () => {
  it("adds up stamps and full rings", () => {
    mocks.stamps = [cafe("Lisbon"), cafe("Porto")];
    mocks.rows = [{ stamped: 2, total: 2 }];
    const { result } = renderHook(() => useBadgeTotals());
    expect(result.current.totals).toMatchObject({
      places: 2,
      cities: 2,
      coffee: 2,
      completeCities: 1,
    });
  });

  it("waits for both queries", () => {
    mocks.rows = undefined;
    expect(renderHook(() => useBadgeTotals()).result.current.totals).toBe(
      undefined,
    );
  });

  it("skips both queries when turned off or signed out", () => {
    renderHook(() => useBadgeTotals(false));
    mocks.authenticated = false;
    renderHook(() => useBadgeTotals());
    expect(mocks.queryArgs).toEqual(["skip", "skip"]);
    expect(mocks.completionEnabled).toEqual([false, true]);
  });
});

describe("useBadgeUnlocks", () => {
  it("reports only badges earned after the first reading", () => {
    const unlock = vi.fn();
    mocks.stamps = [cafe("Lisbon")];
    const { rerender } = renderHook(() => useBadgeUnlocks(unlock));
    expect(unlock).not.toHaveBeenCalled();

    mocks.stamps = [...Array(5)].map(() => cafe("Lisbon"));
    rerender();
    expect(unlock).toHaveBeenCalledWith(["coffeeCrawler"]);
  });

  it("lets a relocked badge unlock again", () => {
    const unlock = vi.fn();
    mocks.stamps = [cafe("Lisbon")];
    const { rerender } = renderHook(() => useBadgeUnlocks(unlock));
    mocks.stamps = [];
    rerender();
    expect(unlock).not.toHaveBeenCalled();
    mocks.stamps = [cafe("Porto")];
    rerender();
    expect(unlock).toHaveBeenCalledWith(["firstStamp"]);
  });

  it("watches nothing for a free user", () => {
    mocks.entitled = false;
    const unlock = vi.fn();
    renderHook(() => useBadgeUnlocks(unlock));
    expect(mocks.queryArgs).toEqual(["skip"]);
    expect(unlock).not.toHaveBeenCalled();
  });
});

describe("useShareBadge", () => {
  it("shares the badge on its own when the passport is not shared", async () => {
    const { result } = renderHook(() => useShareBadge("moment"));
    await act(() => result.current("explorer"));
    expect(mocks.share).toHaveBeenCalledWith({
      message: "I earned the Explorer badge on my Shelvr passport.",
    });
    expect(mocks.capture).toHaveBeenCalledWith("passport_badge_shared", {
      badge: "explorer",
      surface: "moment",
      shared: true,
    });
  });

  it("adds the passport link once the passport is shared", async () => {
    mocks.token = "abc";
    const { result } = renderHook(() => useShareBadge("milestones"));
    await act(() => result.current("foodie"));
    expect(mocks.share).toHaveBeenCalledWith({
      message: "I earned the Foodie badge on my Shelvr passport.",
      url: "https://shelvr.test/passport/abc",
    });

    mocks.os = "android";
    await act(() => result.current("foodie"));
    expect(mocks.share).toHaveBeenLastCalledWith({
      message:
        "I earned the Foodie badge on my Shelvr passport.\nhttps://shelvr.test/passport/abc",
    });
  });

  it("reports a failed share", async () => {
    mocks.share.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useShareBadge("moment"));
    await act(() => result.current("nightOwl"));
    expect(mocks.captureError).toHaveBeenCalledWith(
      "passport_badge_share_failed",
      expect.any(Error),
    );
    expect(mocks.alert).toHaveBeenCalled();
  });
});
