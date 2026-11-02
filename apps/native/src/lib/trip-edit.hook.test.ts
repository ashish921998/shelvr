// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import type { TripPlanDetail } from "@convex/model/tripPlan";
import { usePlaceSearch, useTripEditor } from "./trip-edit";

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

describe("usePlaceSearch", () => {
  type Run = Parameters<typeof usePlaceSearch>[0];
  const answer = (name: string) => ({
    available: true,
    places: [{ name, lat: 1, lng: 1 }],
  });
  const done = (name: string) => ({
    status: "done",
    places: answer(name).places,
  });

  function setup(run: Run, query: string) {
    return renderHook(({ text }) => usePlaceSearch(run, text), {
      initialProps: { text: query },
    });
  }
  const pause = () => act(() => vi.advanceTimersByTimeAsync(1000));

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not search an empty or one-letter query", async () => {
    const run = vi.fn<Run>();
    const { result, rerender } = setup(run, "");
    await pause();
    rerender({ text: " t " });
    await pause();
    expect(run).not.toHaveBeenCalled();
    expect(result.current).toEqual({ status: "idle" });
  });

  it("searches once, for the last text, when typing pauses", async () => {
    const run = vi.fn<Run>().mockResolvedValue(answer("Veracruz"));
    const { result, rerender } = setup(run, "ta");
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(run).not.toHaveBeenCalled();
    rerender({ text: "taco" });
    expect(result.current).toEqual({ status: "searching" });
    await pause();
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("taco");
    expect(result.current).toEqual(done("Veracruz"));
  });

  it("ignores an answer that arrives after the text changed", async () => {
    const replies: ((value: ReturnType<typeof answer>) => void)[] = [];
    const run = vi.fn<Run>(
      () => new Promise((resolve) => replies.push(resolve)),
    );
    const { result, rerender } = setup(run, "taco");
    await pause();
    rerender({ text: "tacos" });
    await pause();
    await act(async () => replies[1]?.(answer("Second")));
    await act(async () => replies[0]?.(answer("First")));
    expect(result.current).toEqual(done("Second"));
  });
});
