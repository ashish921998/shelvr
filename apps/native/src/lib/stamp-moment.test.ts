// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bulkStampMoment,
  placeStampMoment,
  STAMP_TIMING,
  stampLine,
  useStampMoment,
  useStampMomentPlayer,
} from "@/lib/stamp-moment";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  impact: vi.fn(),
  success: vi.fn(),
  announce: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({ analytics: { capture: mocks.capture } }));
vi.mock("@/lib/haptics", () => ({
  haptics: { impact: mocks.impact, success: mocks.success },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: { announceForAccessibility: mocks.announce },
}));

const lisbon = { city: "Lisbon", cover: "https://img/cover.jpg" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("placeStampMoment", () => {
  it("is the first in its city only when the city had no stamp before", () => {
    expect(
      placeStampMoment("Tigre", { ...lisbon, cityVisited: 0 }),
    ).toMatchObject({ firstInCity: true, city: "Lisbon" });
    expect(
      placeStampMoment("Tigre", { ...lisbon, cityVisited: 2 }),
    ).toMatchObject({ firstInCity: false });
    expect(placeStampMoment("Tigre")).toEqual({
      kind: "place",
      name: "Tigre",
      city: "",
      cover: null,
      firstInCity: false,
    });
  });
});

describe("bulkStampMoment", () => {
  it("makes one moment for the whole batch with its count", () => {
    expect(
      bulkStampMoment(3, [{ cover: null }, { cover: "b" }, { cover: "c" }]),
    ).toEqual({ kind: "bulk", count: 3, cover: "b" });
    expect(bulkStampMoment(2, [{ cover: null }])).toEqual({
      kind: "bulk",
      count: 2,
      cover: null,
    });
  });

  it("makes none when nothing new was stamped", () => {
    expect(bulkStampMoment(0, [{ cover: "a" }])).toBeNull();
  });
});

describe("stampLine", () => {
  it("names the city on its first stamp and the place otherwise", () => {
    expect(
      stampLine(placeStampMoment("Tigre", { ...lisbon, cityVisited: 0 })),
    ).toBe('passport.momentFirstInCity {"city":"Lisbon"}');
    expect(
      stampLine(placeStampMoment("Tigre", { ...lisbon, cityVisited: 1 })),
    ).toBe('passport.momentStamped {"name":"Tigre"}');
    expect(
      stampLine(
        placeStampMoment("Tigre", { city: "", cover: null, cityVisited: 0 }),
      ),
    ).toBe('passport.momentStamped {"name":"Tigre"}');
    expect(stampLine({ kind: "bulk", count: 4, cover: null })).toBe(
      'passport.momentBulk {"count":4}',
    );
  });
});

describe("useStampMoment", () => {
  it("does nothing outside the provider", () => {
    const { result } = renderHook(() => useStampMoment());
    expect(() =>
      result.current({ kind: "bulk", count: 1, cover: null }, "already_been"),
    ).not.toThrow();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

describe("useStampMomentPlayer", () => {
  const first = placeStampMoment("Tigre", { ...lisbon, cityVisited: 0 });

  it("shows the moment, reports and announces it once, and taps once on landing", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.play(first, "city"));

    expect(result.current.shown).toMatchObject({
      moment: first,
      line: 'passport.momentFirstInCity {"city":"Lisbon"}',
      ink: "Lisbon",
    });
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith("passport_stamp_landed", {
      surface: "city",
      first_in_city: true,
      count: 1,
    });
    expect(mocks.announce).toHaveBeenCalledWith(
      'passport.momentFirstInCity {"city":"Lisbon"}',
    );
    expect(mocks.impact).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(STAMP_TIMING.drop));
    expect(mocks.impact).toHaveBeenCalledTimes(1);
    expect(mocks.impact).toHaveBeenCalledWith("medium");
    expect(mocks.success).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(STAMP_TIMING.shown));
    expect(result.current.shown).toBeNull();
    expect(mocks.impact).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });

  it("taps right away under Reduce Motion", () => {
    const { result } = renderHook(() => useStampMomentPlayer(true));
    act(() => result.current.play(first, "city"));
    expect(mocks.impact).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(STAMP_TIMING.shown));
    expect(mocks.impact).toHaveBeenCalledTimes(1);
  });

  it("plays one moment for a batch with its count", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() =>
      result.current.play(
        { kind: "bulk", count: 5, cover: null },
        "already_been",
      ),
    );
    expect(result.current.shown?.line).toBe('passport.momentBulk {"count":5}');
    expect(result.current.shown?.ink).toBe("passport.wentNoDate");
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith("passport_stamp_landed", {
      surface: "already_been",
      first_in_city: false,
      count: 5,
    });
  });

  it("waits for a closing sheet before it shows anything", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() =>
      result.current.play(
        { kind: "bulk", count: 2, cover: null },
        "already_been",
        STAMP_TIMING.afterSheet,
      ),
    );
    expect(result.current.shown).toBeNull();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.announce).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(STAMP_TIMING.afterSheet));
    expect(result.current.shown?.moment).toEqual({
      kind: "bulk",
      count: 2,
      cover: null,
    });
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });

  it("goes away early on a tap and keeps the landing tap", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.play(first, "city"));
    act(() => result.current.dismiss());
    expect(result.current.shown).toBeNull();
    act(() => vi.advanceTimersByTime(STAMP_TIMING.shown));
    expect(result.current.shown).toBeNull();
    expect(mocks.impact).toHaveBeenCalledTimes(1);
  });

  it("replaces a showing moment and gives each stamp its own tap", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.play(first, "city"));
    const firstId = result.current.shown?.id;
    act(() => vi.advanceTimersByTime(STAMP_TIMING.shown - 100));
    const second = placeStampMoment("Ramiro", { ...lisbon, cityVisited: 1 });
    act(() => result.current.play(second, "city"));
    expect(result.current.shown?.id).not.toBe(firstId);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.shown?.moment).toEqual(second);
    act(() => vi.advanceTimersByTime(STAMP_TIMING.shown));
    expect(result.current.shown).toBeNull();
    expect(mocks.impact).toHaveBeenCalledTimes(2);
  });

  it("drops a pending landing tap when it unmounts", () => {
    const { result, unmount } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.play(first, "city"));
    unmount();
    vi.advanceTimersByTime(STAMP_TIMING.shown);
    expect(mocks.impact).not.toHaveBeenCalled();
  });
});
