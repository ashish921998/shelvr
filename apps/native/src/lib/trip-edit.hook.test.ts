// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import type { TripPlanDetail } from "@convex/model/tripPlan";
import { useTripEditor } from "./trip-edit";

const mocks = vi.hoisted(() => ({
  move: Object.assign(vi.fn(), { withOptimisticUpdate: vi.fn() }),
  remove: Object.assign(vi.fn(), { withOptimisticUpdate: vi.fn() }),
  selection: vi.fn(),
}));
vi.mock("@/lib/haptics", () => ({ haptics: { selection: mocks.selection } }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn() } }));
vi.mock("@convex/_generated/api", () => ({
  api: { tripPlannerData: { moveTripStop: "move", removeTripStop: "remove" } },
}));
vi.mock("convex/react", () => ({
  useMutation: (name: string) => (name === "move" ? mocks.move : mocks.remove),
}));

const STOP = "stop1" as Id<"tripStops">;
const TRIP: TripPlanDetail = {
  _id: "trip1" as Id<"tripPlans">,
  city: "Lisbon",
  dayCount: 2,
  pace: "balanced",
  interests: [],
  createdAt: 0,
  days: [[{ _id: STOP, name: "Cafe", source: "added", lat: 1, lng: 1 }], []],
  unplanned: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.move.withOptimisticUpdate.mockReturnValue(mocks.move);
  mocks.remove.withOptimisticUpdate.mockReturnValue(mocks.remove);
  mocks.move.mockResolvedValue({ day: 1, index: 0 });
  mocks.remove.mockResolvedValue({ day: 1, index: 0 });
});

it("ticks after a menu move succeeds, and again after Undo", async () => {
  const { result } = renderHook(() => useTripEditor(TRIP));
  await act(() => result.current.moveStop(STOP, { day: 2, index: 0 }, "menu"));
  expect(mocks.selection).toHaveBeenCalledOnce();
  await act(() => result.current.undoLast());
  expect(mocks.selection).toHaveBeenCalledTimes(2);
});

it("does not add a delayed tick to drag feedback or unchanged moves", async () => {
  const { result } = renderHook(() => useTripEditor(TRIP));
  await act(() => result.current.moveStop(STOP, { day: 1, index: 0 }, "menu"));
  expect(mocks.move).not.toHaveBeenCalled();
  await act(() => result.current.moveStop(STOP, { day: 2, index: 0 }, "drag"));
  expect(mocks.selection).not.toHaveBeenCalled();
});

it("ticks on successful removal, and stays quiet when an edit fails", async () => {
  const { result } = renderHook(() => useTripEditor(TRIP));
  await act(() => result.current.removeStop(TRIP.days[0][0]));
  expect(mocks.selection).toHaveBeenCalledOnce();
  mocks.selection.mockClear();
  mocks.move.mockRejectedValueOnce(new Error("offline"));
  await act(() => result.current.moveStop(STOP, { day: 2, index: 0 }, "menu"));
  expect(mocks.selection).not.toHaveBeenCalled();
});
