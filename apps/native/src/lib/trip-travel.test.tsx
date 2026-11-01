// @vitest-environment jsdom
import { ConvexError } from "convex/values";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { travelLayout, type TravelMode } from "@convex/model/tripTravel";
import { travelDirections, travelSummary, useDayTravel } from "./trip-travel";
import { Platform } from "react-native";

const mocks = vi.hoisted(() => ({ estimate: vi.fn(), error: vi.fn() }));
vi.mock("convex/react", () => ({ useAction: () => mocks.estimate }));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.error },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values: { count?: number; distance?: string }) =>
    key === "tripTravel.minutes"
      ? `~${values.count} min`
      : `${values.distance} ${key === "tripTravel.kilometers" ? "km" : "m"}`,
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
const tripId = "trip" as Id<"tripPlans">;
const stops = [
  { _id: "a" as Id<"tripStops">, lat: 38.7, lng: -9.1 },
  { _id: "b" as Id<"tripStops">, lat: 38.71, lng: -9.12 },
];
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  Platform.OS = "ios";
  mocks.estimate.mockResolvedValue([]);
});
it("requests only the active day and includes the exact ordered layout", async () => {
  const hook = renderHook(
    ({ active }) => useDayTravel(tripId, 1, stops, "walking", active),
    { initialProps: { active: false }, wrapper: wrapper() },
  );
  expect(mocks.estimate).not.toHaveBeenCalled();
  hook.rerender({ active: true });
  await waitFor(() =>
    expect(mocks.estimate).toHaveBeenCalledWith({
      tripId,
      day: 1,
      layout: travelLayout(stops),
      mode: "walking",
    }),
  );
});
it("does not show a late walking reply after switching to driving", async () => {
  let finishWalk: ((value: unknown) => void) | undefined;
  mocks.estimate.mockImplementation(({ mode }: { mode: TravelMode }) =>
    mode === "walking"
      ? new Promise((resolve) => {
          finishWalk = resolve;
        })
      : Promise.resolve([
          { key: "drive", estimate: { seconds: 90, meters: 500 } },
        ]),
  );
  const hook = renderHook(
    ({ mode }: { mode: TravelMode }) =>
      useDayTravel(tripId, 1, stops, mode, true),
    { initialProps: { mode: "walking" as TravelMode }, wrapper: wrapper() },
  );
  await waitFor(() => expect(finishWalk).toBeDefined());
  hook.rerender({ mode: "driving" });
  await waitFor(() => expect(hook.result.current.data?.[0]?.key).toBe("drive"));
  await act(async () =>
    finishWalk?.([{ key: "walk", estimate: { seconds: 900, meters: 500 } }]),
  );
  expect(hook.result.current.data?.[0]?.key).toBe("drive");
});
it("invalidates times when stops move, change coordinates or change day", async () => {
  const hook = renderHook(
    ({ points, day }) => useDayTravel(tripId, day, points, "walking", true),
    { initialProps: { points: stops, day: 1 }, wrapper: wrapper() },
  );
  await waitFor(() => expect(mocks.estimate).toHaveBeenCalledTimes(1));
  hook.rerender({ points: [...stops].reverse(), day: 1 });
  await waitFor(() => expect(mocks.estimate).toHaveBeenCalledTimes(2));
  hook.rerender({
    points: stops.map((point) => ({ ...point, lat: point.lat + 0.01 })),
    day: 2,
  });
  await waitFor(() => expect(mocks.estimate).toHaveBeenCalledTimes(3));
  expect(mocks.estimate.mock.calls[2][0].day).toBe(2);
});
it("keeps unavailable results explicit and records failed requests", async () => {
  mocks.estimate.mockRejectedValue(new Error("offline"));
  const hook = renderHook(
    () => useDayTravel(tripId, 1, stops, "walking", true),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.data).toBeUndefined();
  expect(mocks.error).toHaveBeenCalled();
});
it("opens directions from the previous stop, not the user's current location", () => {
  let url = new URL(travelDirections(stops[0], stops[1], "walking"));
  expect(url.searchParams.get("saddr")).toBe("38.7,-9.1");
  expect(url.searchParams.get("daddr")).toBe("38.71,-9.12");
  expect(url.searchParams.get("dirflg")).toBe("w");
  expect(
    new URL(travelDirections(stops[0], stops[1], "driving")).searchParams.get(
      "dirflg",
    ),
  ).toBe("d");
  Platform.OS = "android";
  url = new URL(travelDirections(stops[0], stops[1], "driving"));
  expect(url.searchParams.get("origin")).toBe("38.7,-9.1");
  expect(url.searchParams.get("destination")).toBe("38.71,-9.12");
  expect(url.searchParams.get("travelmode")).toBe("driving");
});
it("rounds durations up and formats real route distance", () => {
  expect(travelSummary({ seconds: 61, meters: 1200 }, "en")).toBe(
    "~2 min · 1.2 km",
  );
  expect(travelSummary({ seconds: 0, meters: 40 }, "en")).toBe("~1 min · 40 m");
});

it("retries a pending optimistic reorder without treating it as an outage", async () => {
  mocks.estimate
    .mockRejectedValueOnce(new ConvexError("trip_layout_changed"))
    .mockResolvedValueOnce([]);
  const hook = renderHook(
    () => useDayTravel(tripId, 1, stops, "walking", true),
    { wrapper: wrapper() },
  );
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true), {
    timeout: 2000,
  });
  expect(mocks.estimate).toHaveBeenCalledTimes(2);
  expect(mocks.error).not.toHaveBeenCalled();
});
