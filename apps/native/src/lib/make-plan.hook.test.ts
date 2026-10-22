// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  useMakePlan,
  usePlaceVisits,
  usePlanAsk,
  usePlanDeck,
  usePlanPicker,
  type PlanPlace,
} from "./make-plan";

const mocks = vi.hoisted(() => ({
  makePlan: vi.fn(),
  setVisited: vi.fn(),
  share: vi.fn(),
  alert: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useAction: () => mocks.makePlan,
  useMutation: () => mocks.setVisited,
}));
vi.mock("@convex/_generated/api", () => ({
  api: { plans: {}, placeVisits: {}, planShares: {} },
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  Share: { share: mocks.share, sharedAction: "sharedAction" },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: vi.fn() },
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
  vi.restoreAllMocks();
  mocks.makePlan.mockReset();
  mocks.setVisited.mockReset();
  mocks.share.mockReset();
  mocks.alert.mockReset();
  mocks.capture.mockReset();
});

describe("usePlaceVisits", () => {
  it("shows a tap at once and saves it", async () => {
    mocks.setVisited.mockResolvedValue(null);
    const tigre = place("Tigre");
    const { result } = renderHook(() => usePlaceVisits());
    expect(result.current.isVisited(tigre)).toBe(false);

    act(() => result.current.toggle(tigre));

    expect(result.current.isVisited(tigre)).toBe(true);
    expect(result.current.isVisited(place("TIGRE"))).toBe(true);
    expect(mocks.setVisited).toHaveBeenCalledWith({
      itemId: tigre.itemId,
      name: "Tigre",
      visited: true,
    });
  });

  it("takes back a place the plan already tagged been", () => {
    mocks.setVisited.mockResolvedValue(null);
    const tigre = { ...place("Tigre"), been: true };
    const { result } = renderHook(() => usePlaceVisits());
    expect(result.current.isVisited(tigre)).toBe(true);

    act(() => result.current.toggle(tigre));

    expect(result.current.isVisited(tigre)).toBe(false);
    expect(mocks.setVisited).toHaveBeenCalledWith(
      expect.objectContaining({ visited: false }),
    );
  });

  it("keeps a newer tap when an older save fails", async () => {
    let failFirst!: (error: Error) => void;
    mocks.setVisited
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          failFirst = reject;
        }),
      )
      .mockResolvedValue(null);
    const tigre = place("Tigre");
    const { result } = renderHook(() => usePlaceVisits());

    act(() => result.current.toggle(tigre));
    act(() => result.current.toggle(tigre));
    act(() => result.current.toggle(tigre));
    expect(result.current.isVisited(tigre)).toBe(true);

    await act(async () => {
      failFirst(new Error("offline"));
      await Promise.resolve();
    });
    expect(result.current.isVisited(tigre)).toBe(true);
  });

  it("goes back when the save fails", async () => {
    mocks.setVisited.mockRejectedValue(new Error("offline"));
    const tigre = place("Tigre");
    const { result } = renderHook(() => usePlaceVisits());

    act(() => result.current.toggle(tigre));

    await waitFor(() => expect(result.current.isVisited(tigre)).toBe(false));
  });
});

describe("useMakePlan", () => {
  it("reads as loading, not the old plan, while a new locale's plan runs", async () => {
    const second = deferred<{ places: PlanPlace[]; considered: number }>();
    mocks.makePlan
      .mockResolvedValueOnce({ places: [place("Alpha")], considered: 3 })
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ locale }) => useMakePlan(SPACE, locale, null),
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
    expect(state.status === "ready" && state.places[0]!.name).toBe("Beta");
  });

  it("waits for the vote link, then shows its shortlist without the model", async () => {
    const shared = {
      expiresAt: Date.now() + 60_000,
      places: [
        {
          name: "Tigre",
          area: "Baixa",
          why: "Seafood",
          itemId: "item" as Id<"items">,
          been: true,
        },
      ],
    };
    const { result, rerender } = renderHook(
      ({ link }: { link: typeof shared | null | undefined }) =>
        useMakePlan(SPACE, "en", link),
      { initialProps: { link: undefined as typeof shared | undefined } },
    );
    expect(result.current.state.status).toBe("loading");
    rerender({ link: shared });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.state).toMatchObject({ places: shared.places });
    expect(mocks.makePlan).not.toHaveBeenCalled();

    mocks.makePlan.mockResolvedValue({
      places: [place("Alpha")],
      considered: 3,
    });
    await act(() => result.current.retry());
    expect(result.current.state).toMatchObject({ places: [place("Alpha")] });
  });

  it("asks the model when the link has closed", async () => {
    mocks.makePlan.mockResolvedValue({
      places: [place("Alpha")],
      considered: 3,
    });
    const closed = {
      expiresAt: Date.now() - 1,
      places: [
        { name: "Tigre", why: "Seafood", itemId: "item" as Id<"items"> },
      ],
    };
    const { result } = renderHook(() => useMakePlan(SPACE, "en", closed));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(mocks.makePlan).toHaveBeenCalledTimes(1);
  });

  it("makes a new link when the open one has closed since it loaded", async () => {
    mocks.setVisited.mockResolvedValue("fresh");
    mocks.share.mockResolvedValue({ action: "sharedAction" });
    const places = [place("Tigre")];
    const { result } = renderHook(() =>
      usePlanAsk(SPACE, places, { token: "old", expiresAt: Date.now() - 1 }),
    );
    await act(() => result.current.ask());
    expect(mocks.setVisited).toHaveBeenCalledTimes(1);
    expect(mocks.share.mock.calls[0]![0].message).toContain("/p/fresh");
  });

  it("gives every answer its own plan id", async () => {
    mocks.makePlan.mockResolvedValue({
      places: [place("Alpha")],
      considered: 3,
    });
    const { result } = renderHook(() => useMakePlan(SPACE, "en", null));
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

    rerender({ planId: null });
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current.isSpinning).toBe(false);
    spinToEnd();
    expect(onPicked).not.toHaveBeenCalled();

    rerender({ planId: 2 });
    act(() => result.current.pickForMe());
    spinToEnd();
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(result.current.picked).not.toBeNull();
    expect(onPicked).toHaveBeenCalledWith(result.current.picked);
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

describe("usePlanDeck", () => {
  it("sends the top card to the back and turns the new one face up", () => {
    const { result } = renderHook(() => usePlanDeck(1, 3));
    act(() => result.current.flip());
    expect(result.current.flipped).toBe(true);

    act(() => result.current.next());
    expect(result.current).toMatchObject({ front: 1, flipped: false });
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.front).toBe(0);
  });

  it("brings a dealt card to the top", () => {
    const { result } = renderHook(() => usePlanDeck(1, 5));
    act(() => result.current.show(3));
    expect(result.current).toMatchObject({ front: 3, flipped: false });
  });

  it("starts a new plan on its first card", () => {
    const { result, rerender } = renderHook(
      ({ planId }) => usePlanDeck(planId, 5),
      { initialProps: { planId: 1 } },
    );
    act(() => result.current.show(4));
    act(() => result.current.flip());

    rerender({ planId: 2 });

    expect(result.current).toMatchObject({ front: 0, flipped: false });
  });
});

describe("usePlanAsk", () => {
  const places = [place("Tigre"), place("Sweet Linda")];

  it("makes a link, then shares it", async () => {
    mocks.setVisited.mockResolvedValue("tok1");
    mocks.share.mockResolvedValue({ action: "sharedAction" });
    const { result } = renderHook(() => usePlanAsk(SPACE, places, null));

    await act(() => result.current.ask());

    expect(mocks.setVisited).toHaveBeenCalledTimes(1);
    expect(mocks.share.mock.calls[0]![0].message).toContain("/p/tok1");
    expect(mocks.capture).toHaveBeenCalledWith("plan_asked", {
      place_count: 2,
    });
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it("sends the open link again instead of replacing it", async () => {
    mocks.share.mockResolvedValue({ action: "dismissedAction" });
    const { result } = renderHook(() =>
      usePlanAsk(SPACE, places, {
        token: "open",
        expiresAt: Date.now() + 60_000,
      }),
    );

    await act(() => result.current.ask());

    expect(mocks.setVisited).not.toHaveBeenCalled();
    expect(mocks.share.mock.calls[0]![0].message).toContain("/p/open");
    expect(mocks.capture).not.toHaveBeenCalledWith("plan_asked", {
      place_count: 2,
    });
    expect(mocks.alert).not.toHaveBeenCalled();
  });

  it("asks once while a tap is still in flight", async () => {
    const link = deferred<string>();
    mocks.setVisited.mockReturnValue(link.promise);
    mocks.share.mockResolvedValue({ action: "sharedAction" });
    const { result } = renderHook(() => usePlanAsk(SPACE, places, null));

    let first!: Promise<void>;
    act(() => {
      first = result.current.ask();
      void result.current.ask();
    });
    link.resolve("tok");
    await act(() => first);

    expect(mocks.setVisited).toHaveBeenCalledTimes(1);
    expect(mocks.share).toHaveBeenCalledTimes(1);
  });

  it("names which step failed", async () => {
    mocks.setVisited.mockRejectedValue(new Error("limit"));
    const { result } = renderHook(() => usePlanAsk(SPACE, places, null));
    await act(() => result.current.ask());
    expect(mocks.capture).toHaveBeenCalledWith("plan_ask_failed", {
      reason: "link",
    });
    expect(mocks.share).not.toHaveBeenCalled();

    mocks.capture.mockReset();
    mocks.setVisited.mockResolvedValue("tok");
    mocks.share.mockRejectedValue(new Error("no handler"));
    await act(() => result.current.ask());
    expect(mocks.capture).toHaveBeenCalledWith("plan_ask_failed", {
      reason: "share",
    });
    expect(mocks.alert).toHaveBeenCalledTimes(2);
  });
});
