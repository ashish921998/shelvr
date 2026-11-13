// @vitest-environment jsdom
import { cityPinId } from "@/lib/city-pins";
import type { ListRow, SharedListPlace } from "@/lib/shared-lists";
import type { Id } from "@convex/_generated/dataModel";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dropOrder, useFreshPinDrop } from "./fresh-pins";

const mocks = vi.hoisted(() => ({ reduced: false }));

vi.mock("react-native-reanimated", () => ({
  useReducedMotion: () => mocks.reduced,
}));
vi.mock("@/lib/motion", () => ({ motion: { duration: { stagger: 300 } } }));

beforeEach(() => {
  mocks.reduced = false;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function row(
  name: string,
  over: Partial<SharedListPlace> & { number?: number } = {},
): ListRow {
  const { number = 1, ...rest } = over;
  const place: SharedListPlace = {
    _id: `p-${name}` as Id<"sharedListPlaces">,
    name,
    lat: 30.26,
    lng: -97.74,
    city: "Austin",
    addedByYou: false,
    addedAt: 1,
    isNew: false,
    ...rest,
  };
  return {
    place,
    pin: {
      itemId: place._id,
      name,
      lat: place.lat,
      lng: place.lng,
      kinds: [],
      number,
    },
  };
}

const names = (pins: { name: string }[]) => pins.map((pin) => pin.name);

function shownNames(result: {
  current: { pins: { name: string }[]; visible: number };
}) {
  return names(result.current.pins.slice(0, result.current.visible));
}

function tick() {
  act(() => {
    vi.advanceTimersByTime(300);
  });
}

describe("dropOrder", () => {
  it("puts old pins first, then fresh pins already shown, then the waiting ones, each oldest first", () => {
    const rows = [
      row("Fresh late", { isNew: true, addedAt: 30, number: 1 }),
      row("Fresh early", { isNew: true, addedAt: 10, number: 2 }),
      row("Fresh shown", { isNew: true, addedAt: 20, number: 3 }),
      row("Old late", { addedAt: 5, number: 4 }),
      row("Old early", { addedAt: 2, number: 5 }),
    ];
    const shown = new Set([cityPinId(rows[2].pin)]);
    const order = dropOrder(rows, shown);
    expect(names(order.pins)).toEqual([
      "Old early",
      "Old late",
      "Fresh shown",
      "Fresh early",
      "Fresh late",
    ]);
    expect(order.pins.map((pin) => pin.number)).toEqual([5, 4, 3, 2, 1]);
    expect(order.settled).toBe(3);
    expect(order.waiting).toEqual([
      cityPinId(rows[1].pin),
      cityPinId(rows[0].pin),
    ]);
    expect(names(rows.map((entry) => entry.pin))).toEqual([
      "Fresh late",
      "Fresh early",
      "Fresh shown",
      "Old late",
      "Old early",
    ]);
  });
});

describe("useFreshPinDrop", () => {
  const old = [row("Jo's Coffee"), row("Houndstooth Coffee")];
  const fresh = (count: number, from = 0) =>
    Array.from({ length: count }, (_, index) =>
      row(`Fresh ${from + index}`, {
        isNew: true,
        addedAt: 100 + from + index,
      }),
    );

  it("shows the old pins at once and drops three fresh ones a beat apart", () => {
    const rows = [...fresh(3), ...old];
    const { result } = renderHook(() => useFreshPinDrop(rows, "Austin"));
    expect(result.current.visible).toBe(2);
    expect(shownNames(result)).toEqual(["Jo's Coffee", "Houndstooth Coffee"]);
    tick();
    expect(result.current.visible).toBe(3);
    expect(shownNames(result).at(-1)).toBe("Fresh 0");
    tick();
    expect(result.current.visible).toBe(4);
    tick();
    expect(result.current.visible).toBe(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops five one by one, then the rest together on the sixth beat", () => {
    const rows = [...old, ...fresh(9)];
    const { result } = renderHook(() => useFreshPinDrop(rows, "Austin"));
    const counts = [result.current.visible];
    for (let beat = 0; beat < 6; beat += 1) {
      tick();
      counts.push(result.current.visible);
    }
    expect(counts).toEqual([2, 3, 4, 5, 6, 7, 11]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops a place that arrives after the first drops one beat later", () => {
    const first = [...old, ...fresh(6)];
    const { result, rerender } = renderHook(
      ({ rows }) => useFreshPinDrop(rows, "Austin"),
      { initialProps: { rows: first } },
    );
    for (let beat = 0; beat < 6; beat += 1) tick();
    expect(result.current.visible).toBe(8);
    rerender({ rows: [...first, ...fresh(1, 6)] });
    expect(result.current.pins).toHaveLength(9);
    expect(result.current.visible).toBe(8);
    tick();
    expect(result.current.visible).toBe(9);
    expect(shownNames(result).at(-1)).toBe("Fresh 6");
  });

  it("shows what was seen at once after leaving, and drops only the new arrival", () => {
    const first = [...old, ...fresh(3)];
    const { result, rerender } = renderHook(
      ({ rows }) => useFreshPinDrop(rows, "Austin"),
      { initialProps: { rows: first } },
    );
    for (let beat = 0; beat < 3; beat += 1) tick();
    const seen = first.map((entry) => ({
      ...entry,
      place: { ...entry.place, isNew: false },
    }));
    rerender({ rows: [...seen, ...fresh(1, 3)] });
    expect(result.current.visible).toBe(5);
    expect(shownNames(result)).not.toContain("Fresh 3");
    tick();
    expect(result.current.visible).toBe(6);
    expect(shownNames(result).at(-1)).toBe("Fresh 3");
  });

  it("keeps its record per city, so switching back replays nothing", () => {
    const austin = [...old, ...fresh(2)];
    const lisbon = [
      row("Time Out Market", { city: "Lisbon" }),
      row("Miradouro", { city: "Lisbon", isNew: true, addedAt: 50 }),
      row("Pastéis", { city: "Lisbon", isNew: true, addedAt: 60 }),
    ];
    const { result, rerender } = renderHook(
      ({ rows, city }) => useFreshPinDrop(rows, city),
      { initialProps: { rows: austin, city: "Austin" } },
    );
    tick();
    tick();
    expect(result.current.visible).toBe(4);

    rerender({ rows: lisbon, city: "Lisbon" });
    expect(result.current.visible).toBe(1);
    tick();
    expect(result.current.visible).toBe(2);
    tick();
    expect(result.current.visible).toBe(3);

    rerender({ rows: austin, city: "austin" });
    expect(result.current.visible).toBe(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows every pin at once under Reduce Motion, with no timer", () => {
    mocks.reduced = true;
    const rows = [...old, ...fresh(4)];
    const { result } = renderHook(() => useFreshPinDrop(rows, "Austin"));
    expect(result.current.visible).toBe(6);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("opens a list in a city named like an Object property without crashing", () => {
    const rows = [row("Odd", { city: "__proto__", isNew: true, addedAt: 5 })];
    for (const city of ["__proto__", "constructor", "toString"]) {
      const { result } = renderHook(() => useFreshPinDrop(rows, city));
      expect(result.current.pins).toHaveLength(1);
      expect(result.current.visible).toBe(0);
    }
  });

  it("shows a selected pin at once, and keeps it shown after the selection moves", () => {
    const rows = [...old, ...fresh(3)];
    const last = cityPinId(rows[4].pin);
    const { result, rerender } = renderHook(
      ({ selected }) => useFreshPinDrop(rows, "Austin", selected),
      { initialProps: { selected: null as string | null } },
    );
    expect(shownNames(result)).not.toContain("Fresh 2");
    rerender({ selected: last });
    expect(shownNames(result)).toContain("Fresh 2");
    rerender({ selected: null });
    expect(shownNames(result)).toContain("Fresh 2");
    tick();
    tick();
    expect(result.current.visible).toBe(5);
    expect(vi.getTimerCount()).toBe(0);
  });
});
