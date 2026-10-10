// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { useMakePlan, usePlanPicker, type PlanPlace } from "./make-plan";

const mocks = vi.hoisted(() => ({ makePlan: vi.fn() }));
vi.mock("convex/react", () => ({ useAction: () => mocks.makePlan }));
vi.mock("@convex/_generated/api", () => ({ api: { plans: {} } }));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));

const SPACE = "space1" as Id<"spaces">;

function place(name: string): PlanPlace {
  return { name, why: `Why ${name}`, itemId: "item" as Id<"items"> };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
  mocks.makePlan.mockReset();
});

describe("useMakePlan", () => {
  it("reads as loading, not the old plan, while a new locale's plan runs", async () => {
    const second = deferred<{ places: PlanPlace[]; considered: number }>();
    mocks.makePlan
      .mockResolvedValueOnce({ places: [place("Alpha")], considered: 3 })
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ locale }) => useMakePlan(SPACE, locale),
      { initialProps: { locale: "en" } },
    );
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    rerender({ locale: "ja" });
    expect(result.current.state.status).toBe("loading");

    await act(async () => {
      second.resolve({ places: [place("Beta")], considered: 3 });
      await second.promise;
    });
    const state = result.current.state;
    expect(state.status === "ready" && state.places[0].name).toBe("Beta");
  });

  it("gives every answer its own plan id", async () => {
    mocks.makePlan.mockResolvedValue({
      places: [place("Alpha")],
      considered: 3,
    });
    const { result } = renderHook(() => useMakePlan(SPACE, "en"));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    const first = result.current.state;

    await act(() => result.current.retry());
    const second = result.current.state;
    expect(first.status === "ready" && second.status === "ready").toBe(true);
    if (first.status === "ready" && second.status === "ready") {
      expect(second.planId).not.toBe(first.planId);
    }
  });
});

describe("usePlanPicker", () => {
  const options = { reducedMotion: false };

  function spinToEnd() {
    act(() => {
      vi.runAllTimers();
    });
  }

  it("drops the pick when a new plan replaces the old one", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result, rerender } = renderHook(
      ({ places, planId }) => usePlanPicker(places, planId, options),
      { initialProps: { places: [place("Alpha"), place("Beta")], planId: 1 } },
    );
    act(() => result.current.pickForMe());
    spinToEnd();
    expect(result.current.pickedPlace?.name).toBe("Alpha");

    // The same index now points at another place: it must not carry over.
    rerender({ places: [place("Beta"), place("Alpha")], planId: 2 });
    expect(result.current.picked).toBeNull();
    expect(result.current.pickedPlace).toBeNull();
    expect(result.current.highlight).toBeNull();
  });

  it("stops a spin when the plan is regenerated mid-spin", () => {
    vi.useFakeTimers();
    const onPicked = vi.fn();
    const places = [place("Alpha"), place("Beta"), place("Gamma")];
    const { result, rerender } = renderHook(
      ({ planId }: { planId: number | null }) =>
        usePlanPicker(places, planId, { reducedMotion: false, onPicked }),
      { initialProps: { planId: 1 as number | null } },
    );
    act(() => result.current.pickForMe());
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.isSpinning).toBe(true);

    // Retry: the plan goes back to loading.
    rerender({ planId: null });
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.isSpinning).toBe(false);
    spinToEnd();
    expect(onPicked).not.toHaveBeenCalled();

    // The next plan can be picked from straight away.
    rerender({ planId: 2 });
    act(() => result.current.pickForMe());
    spinToEnd();
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(result.current.picked).not.toBeNull();
  });

  it("clears its timers on unmount", () => {
    vi.useFakeTimers();
    const onPicked = vi.fn();
    const { result, unmount } = renderHook(() =>
      usePlanPicker([place("Alpha"), place("Beta")], 1, {
        reducedMotion: false,
        onPicked,
      }),
    );
    act(() => result.current.pickForMe());
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("ignores a second tap while spinning and lands at once with Reduce Motion", () => {
    vi.useFakeTimers();
    const onPicked = vi.fn();
    const places = [place("Alpha"), place("Beta")];
    const { result, rerender } = renderHook(
      ({ reducedMotion }) =>
        usePlanPicker(places, 1, { reducedMotion, onPicked }),
      { initialProps: { reducedMotion: false } },
    );
    act(() => result.current.pickForMe());
    act(() => result.current.pickForMe());
    spinToEnd();
    expect(onPicked).toHaveBeenCalledTimes(1);

    rerender({ reducedMotion: true });
    act(() => result.current.pickForMe());
    expect(vi.getTimerCount()).toBe(1);
    spinToEnd();
    expect(onPicked).toHaveBeenCalledTimes(2);
  });
});
