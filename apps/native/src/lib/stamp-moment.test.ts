// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bulkStampMoment,
  cityStampMoment,
  cityStampPlace,
  completesCity,
  placeStampMoment,
  STAMP_TIMING,
  type StampMoment,
  type StampMomentControls,
  StampMomentPlayContext,
  stampLine,
  useStampMoment,
  useStampMomentLanding,
  useStampMomentPlayer,
} from "@/lib/stamp-moment";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  impact: vi.fn(),
  success: vi.fn(),
  announce: vi.fn(),
  transitionEnd: [] as ((event: { data?: { closing?: boolean } }) => void)[],
  off: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({ analytics: { capture: mocks.capture } }));
vi.mock("@/lib/haptics", () => ({
  haptics: { impact: mocks.impact, success: mocks.success },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useFocusEffect: (effect: () => () => void) => useEffect(effect, [effect]),
    useNavigation: () => ({
      addListener: (
        _type: string,
        listener: (event: { data?: { closing?: boolean } }) => void,
      ) => {
        mocks.transitionEnd.push(listener);
        return mocks.off;
      },
    }),
  };
});
vi.mock("react-native", () => ({
  AccessibilityInfo: { announceForAccessibility: mocks.announce },
}));

const lisbon = { city: "Lisbon", cover: "https://img/cover.jpg" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transitionEnd = [];
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
      completedTotal: null,
    });
  });

  it("completes the city only when this stamp is its last unstamped place", () => {
    expect(
      placeStampMoment("Tigre", { ...lisbon, cityVisited: 6, cityTotal: 7 }),
    ).toMatchObject({ completedTotal: 7, firstInCity: false });
    expect(
      placeStampMoment("Tigre", { ...lisbon, cityVisited: 0, cityTotal: 1 }),
    ).toMatchObject({ completedTotal: 1, firstInCity: true });
    expect(
      placeStampMoment("Tigre", { ...lisbon, cityVisited: 5, cityTotal: 7 }),
    ).toMatchObject({ completedTotal: null });
    expect(
      placeStampMoment("Tigre", { ...lisbon, cityVisited: 7, cityTotal: 7 }),
    ).toMatchObject({ completedTotal: null });
    expect(
      placeStampMoment("Tigre", { ...lisbon, cityVisited: 2 }),
    ).toMatchObject({ completedTotal: null });
    expect(
      placeStampMoment("Tigre", {
        city: "",
        cover: null,
        cityVisited: 0,
        cityTotal: 1,
      }),
    ).toMatchObject({ completedTotal: null });
  });
});

describe("cityStampPlace", () => {
  it("carries the city's counts before the stamp so the moment can tell first and last", () => {
    const place = cityStampPlace("Lisbon", null, { stamped: 11, total: 12 });
    expect(place).toEqual({
      city: "Lisbon",
      cover: null,
      cityVisited: 11,
      cityTotal: 12,
    });
    expect(placeStampMoment("Tigre", place)).toMatchObject({
      completedTotal: 12,
    });
  });

  it("claims neither first nor last while the city's counts are unknown", () => {
    const place = cityStampPlace("Lisbon", "c", undefined);
    expect(placeStampMoment("Tigre", place)).toMatchObject({
      firstInCity: false,
      completedTotal: null,
    });
  });
});

describe("completesCity", () => {
  it("is true only when the stamp moves the city from short of full to full", () => {
    expect(
      completesCity({ stamped: 6, total: 7 }, { stamped: 7, total: 7 }),
    ).toBe(true);
    expect(
      completesCity({ stamped: 5, total: 7 }, { stamped: 6, total: 7 }),
    ).toBe(false);
    expect(
      completesCity({ stamped: 7, total: 7 }, { stamped: 7, total: 7 }),
    ).toBe(false);
    expect(
      completesCity({ stamped: 0, total: 0 }, { stamped: 1, total: 0 }),
    ).toBe(false);
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
    expect(
      stampLine(
        placeStampMoment("Tigre", {
          ...lisbon,
          cityVisited: 0,
          cityTotal: 1,
        }),
      ),
    ).toBe('passport.momentCityComplete {"city":"Lisbon"}');
    expect(stampLine({ kind: "bulk", count: 4, cover: null })).toBe(
      'passport.momentBulk {"count":4}',
    );
  });
});

describe("useStampMoment", () => {
  it("does nothing outside the provider", () => {
    const { result } = renderHook(() => useStampMoment());
    const moment: StampMoment = { kind: "bulk", count: 1, cover: null };
    expect(() => {
      result.current.play(moment, "already_been");
      result.current.queue(moment, "already_been");
    }).not.toThrow();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});

describe("useStampMomentPlayer", () => {
  const first = placeStampMoment("Tigre", { ...lisbon, cityVisited: 0 });
  const batch: StampMoment = { kind: "bulk", count: 2, cover: null };

  it("shows the moment, reports and announces it once, and taps once on landing", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.controls.play(first, "city"));

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
    act(() => result.current.controls.play(first, "city"));
    expect(mocks.impact).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(STAMP_TIMING.shown));
    expect(mocks.impact).toHaveBeenCalledTimes(1);
  });

  it("reports a city completed once, alongside the landing, with its total", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    const last = placeStampMoment("Tigre", {
      ...lisbon,
      cityVisited: 11,
      cityTotal: 12,
    });
    act(() => result.current.controls.play(last, "next_to_stamp"));
    expect(result.current.shown?.line).toBe(
      'passport.momentCityComplete {"city":"Lisbon"}',
    );
    expect(mocks.capture.mock.calls).toEqual([
      [
        "passport_stamp_landed",
        { surface: "next_to_stamp", first_in_city: false, count: 1 },
      ],
      ["passport_city_completed", { surface: "next_to_stamp", total: 12 }],
    ]);
    expect(mocks.announce).toHaveBeenCalledWith(
      'passport.momentCityComplete {"city":"Lisbon"}',
    );

    mocks.capture.mockClear();
    act(() =>
      result.current.controls.play(
        placeStampMoment("Tigre", { ...lisbon, cityVisited: 3, cityTotal: 12 }),
        "city",
      ),
    );
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).not.toHaveBeenCalledWith(
      "passport_city_completed",
      expect.anything(),
    );
  });

  it("plays one moment for a batch with its count", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() =>
      result.current.controls.play(
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

  it("plays a city stamp as its own round moment, with no place and no completion", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() =>
      result.current.controls.play(cityStampMoment("Lisbon"), "city_stamps"),
    );
    expect(result.current.shown).toMatchObject({
      moment: { kind: "city", city: "Lisbon", cover: null },
      line: 'passport.momentCityStamp {"city":"Lisbon"}',
      ink: "Lisbon",
    });
    expect(mocks.capture.mock.calls).toEqual([
      [
        "passport_stamp_landed",
        { surface: "city_stamps", first_in_city: false, count: 1 },
      ],
    ]);
    expect(mocks.announce).toHaveBeenCalledWith(
      'passport.momentCityStamp {"city":"Lisbon"}',
    );
    act(() => vi.advanceTimersByTime(STAMP_TIMING.drop));
    expect(mocks.impact).toHaveBeenCalledWith("medium");
  });

  it("holds a queued moment until it is released, then plays it once", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.controls.queue(batch, "already_been"));
    act(() => vi.advanceTimersByTime(STAMP_TIMING.queueLimit - 1));
    expect(result.current.shown).toBeNull();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.announce).not.toHaveBeenCalled();
    expect(mocks.impact).not.toHaveBeenCalled();

    act(() => result.current.controls.release());
    expect(result.current.shown?.moment).toEqual(batch);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.announce).toHaveBeenCalledWith(
      'passport.momentBulk {"count":2}',
    );
    act(() => vi.advanceTimersByTime(STAMP_TIMING.drop));
    expect(mocks.impact).toHaveBeenCalledTimes(1);

    act(() => result.current.controls.release());
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });

  it("drops a queued moment that is never released in time", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.controls.queue(batch, "already_been"));
    act(() => vi.advanceTimersByTime(STAMP_TIMING.queueLimit));
    act(() => result.current.controls.release());
    act(() => vi.advanceTimersByTime(STAMP_TIMING.shown));
    expect(result.current.shown).toBeNull();
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(mocks.announce).not.toHaveBeenCalled();
    expect(mocks.impact).not.toHaveBeenCalled();
  });

  it("keeps only the latest queued moment", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.controls.queue(batch, "already_been"));
    const later = { ...batch, count: 6 };
    act(() => result.current.controls.queue(later, "already_been"));
    act(() => result.current.controls.release());
    expect(result.current.shown?.moment).toEqual(later);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });

  it("forgets a queued moment when it unmounts", () => {
    const { result, unmount } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.controls.queue(batch, "already_been"));
    const { release } = result.current.controls;
    unmount();
    release();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("goes away early on a tap and keeps the landing tap", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.controls.play(first, "city"));
    act(() => result.current.dismiss());
    expect(result.current.shown).toBeNull();
    act(() => vi.advanceTimersByTime(STAMP_TIMING.shown));
    expect(result.current.shown).toBeNull();
    expect(mocks.impact).toHaveBeenCalledTimes(1);
  });

  it("replaces a showing moment and gives each stamp its own tap", () => {
    const { result } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.controls.play(first, "city"));
    const firstId = result.current.shown?.id;
    act(() => vi.advanceTimersByTime(STAMP_TIMING.shown - 100));
    const second = placeStampMoment("Ramiro", { ...lisbon, cityVisited: 1 });
    act(() => result.current.controls.play(second, "city"));
    expect(result.current.shown?.id).not.toBe(firstId);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.shown?.moment).toEqual(second);
    act(() => vi.advanceTimersByTime(STAMP_TIMING.shown));
    expect(result.current.shown).toBeNull();
    expect(mocks.impact).toHaveBeenCalledTimes(2);
  });

  it("drops a pending landing tap when it unmounts", () => {
    const { result, unmount } = renderHook(() => useStampMomentPlayer(false));
    act(() => result.current.controls.play(first, "city"));
    unmount();
    vi.advanceTimersByTime(STAMP_TIMING.shown);
    expect(mocks.impact).not.toHaveBeenCalled();
  });
});

describe("useStampMomentLanding", () => {
  const controls: StampMomentControls = {
    play: vi.fn(),
    queue: vi.fn(),
    release: vi.fn(),
  };
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(StampMomentPlayContext, { value: controls }, children);

  it("releases once the screen it focuses has finished appearing", () => {
    renderHook(() => useStampMomentLanding(), { wrapper });
    expect(controls.release).not.toHaveBeenCalled();
    act(() => mocks.transitionEnd[0]({ data: { closing: true } }));
    expect(controls.release).not.toHaveBeenCalled();
    act(() => mocks.transitionEnd[0]({ data: { closing: false } }));
    expect(controls.release).toHaveBeenCalledTimes(1);
  });

  it("releases after the sheet has settled when no transition event comes", () => {
    renderHook(() => useStampMomentLanding(), { wrapper });
    act(() => vi.advanceTimersByTime(STAMP_TIMING.sheetSettle - 1));
    expect(controls.release).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(controls.release).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when the screen loses focus", () => {
    const { unmount } = renderHook(() => useStampMomentLanding(), { wrapper });
    unmount();
    expect(mocks.off).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(STAMP_TIMING.sheetSettle);
    expect(controls.release).not.toHaveBeenCalled();
  });
});
