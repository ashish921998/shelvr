// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { useBuildTrip } from "./trip";

const mocks = vi.hoisted(() => ({
  makeTrip: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock("convex/react", () => ({ useAction: () => mocks.makeTrip }));
vi.mock("@convex/_generated/api", () => ({ api: { trips: {} } }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

const SPACE = "space1" as Id<"spaces">;
const TRIP = "trip1" as Id<"trips">;
const REQUEST = { days: 2, pace: "easy" as const, city: "Lisbon" };

beforeEach(() => vi.resetAllMocks());

it("reports a failed trip request and can retry successfully", async () => {
  const failure = new Error("offline");
  mocks.makeTrip.mockRejectedValueOnce(failure).mockResolvedValueOnce({
    tripId: TRIP,
    considered: 4,
  });
  const { result } = renderHook(() => useBuildTrip(SPACE, "en"));
  await act(async () => {
    expect(await result.current.build(REQUEST, null)).toBe(false);
  });
  expect(result.current.state).toEqual({ status: "error" });
  expect(mocks.capture).toHaveBeenCalledWith("trip_failed", {
    reason: "error",
  });
  expect(mocks.captureError).toHaveBeenCalledWith("make_trip_failed", failure);

  await act(async () => {
    expect(await result.current.build(REQUEST, null)).toBe(true);
  });
  expect(result.current.state).toEqual({ status: "arriving", previous: null });
  expect(mocks.makeTrip).toHaveBeenLastCalledWith({
    spaceId: SPACE,
    locale: "en",
    ...REQUEST,
  });
});

it("keeps an empty result distinct from a failed request", async () => {
  mocks.makeTrip.mockResolvedValue({ tripId: null, considered: 4 });
  const { result } = renderHook(() => useBuildTrip(SPACE, "en"));
  await act(async () => {
    expect(await result.current.build(REQUEST, TRIP)).toBe(false);
  });
  expect(result.current.state).toEqual({ status: "empty", considered: 4 });
  expect(mocks.captureError).not.toHaveBeenCalled();
  act(() => result.current.reset());
  expect(result.current.state).toEqual({ status: "idle" });
});
