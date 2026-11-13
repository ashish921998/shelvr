// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePlaceVisit } from "@/lib/use-place-visit";
import type { Id } from "@convex/_generated/dataModel";

const mocks = vi.hoisted(() => ({
  setVisited: vi.fn(),
  openPaywall: vi.fn(),
  alert: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  router: { push: vi.fn() },
}));

vi.mock("convex/react", () => ({ useMutation: () => mocks.setVisited }));
vi.mock("expo-router", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/entitlement", () => ({ openPaywall: mocks.openPaywall }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/haptics", () => ({
  haptics: { success: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native", () => ({ Alert: { alert: mocks.alert } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}) }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));

const itemId = "item-1" as Id<"items">;
const taco = { name: "Taco Spot", lat: 30.1, lng: -97.1, appleId: "taco" };

async function toggle(pin: typeof taco | Omit<typeof taco, "appleId">) {
  const { result } = renderHook(() => usePlaceVisit());
  await act(() => result.current.toggle(itemId, pin, true));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setVisited.mockResolvedValue(null);
});

describe("usePlaceVisit", () => {
  it("sends where the place is with the mark", async () => {
    await toggle(taco);
    await toggle({ name: "BBQ Pit", lat: 30.2, lng: -97.2 });
    expect(mocks.setVisited.mock.calls).toEqual([
      [
        {
          itemId,
          name: "Taco Spot",
          visited: true,
          spot: { lat: 30.1, lng: -97.1, appleId: "taco" },
        },
      ],
      [
        {
          itemId,
          name: "BBQ Pit",
          visited: true,
          spot: { lat: 30.2, lng: -97.2 },
        },
      ],
    ]);
    expect(mocks.capture).toHaveBeenCalledWith("city_place_visited", {
      visited: true,
    });
  });

  it("opens the paywall when marking needs Pro", async () => {
    mocks.setVisited.mockRejectedValue(
      new ConvexError({ code: "pro_required", message: "Pro required" }),
    );
    await toggle(taco);
    expect(mocks.openPaywall).toHaveBeenCalledWith(
      mocks.router,
      "mark_visited",
    );
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it("says to wait a few minutes when too many places were marked", async () => {
    mocks.setVisited.mockRejectedValue(
      new ConvexError({
        kind: "RateLimited",
        name: "placeVisit",
        retryAfter: 6000,
      }),
    );
    await toggle(taco);
    expect(mocks.alert).toHaveBeenCalledWith("cityProgress.rateLimited");
    expect(mocks.captureError).not.toHaveBeenCalled();
    expect(mocks.openPaywall).not.toHaveBeenCalled();
  });

  it("reports any other failure and asks to try again", async () => {
    const error = new Error("network");
    mocks.setVisited.mockRejectedValue(error);
    await toggle(taco);
    expect(mocks.captureError).toHaveBeenCalledWith(
      "place_visit_failed",
      error,
      { surface: "city" },
    );
    expect(mocks.alert).toHaveBeenCalledWith(
      "errors.unexpectedTitle",
      "errors.retrySoon",
    );
  });

  it("takes back a passport stamp by its spot, or by name when it has none", async () => {
    const { result } = renderHook(() => usePlaceVisit("passport"));
    let done = false;
    await act(async () => {
      done = await result.current.toggle(
        itemId,
        { name: "Tigre", lat: 1, lng: 2 },
        false,
      );
    });
    await act(() => result.current.toggle(itemId, { name: "Tigre" }, false));
    expect(done).toBe(true);
    expect(mocks.setVisited.mock.calls).toEqual([
      [{ itemId, name: "Tigre", visited: false, spot: { lat: 1, lng: 2 } }],
      [{ itemId, name: "Tigre", visited: false }],
    ]);
    expect(mocks.capture).toHaveBeenCalledWith("place_unstamped", {
      surface: "passport",
    });
  });

  it("answers false and names the passport when taking a stamp back fails", async () => {
    const error = new Error("offline");
    mocks.setVisited.mockRejectedValue(error);
    const { result } = renderHook(() => usePlaceVisit("passport"));
    let done = true;
    await act(async () => {
      done = await result.current.toggle(itemId, { name: "Tigre" }, false);
    });
    expect(done).toBe(false);
    expect(mocks.captureError).toHaveBeenCalledWith(
      "place_visit_failed",
      error,
      { surface: "passport" },
    );
  });

  it("sends one request for a double tap", async () => {
    let finish = () => {};
    mocks.setVisited.mockImplementation(
      () => new Promise<null>((resolve) => (finish = () => resolve(null))),
    );
    const { result } = renderHook(() => usePlaceVisit("passport"));
    await act(async () => {
      const first = result.current.toggle(itemId, { name: "Tigre" }, false);
      void result.current.toggle(itemId, { name: "Tigre" }, false);
      finish();
      await first;
    });
    expect(mocks.setVisited).toHaveBeenCalledTimes(1);
  });
});
