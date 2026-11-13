// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CityRing,
  cityRingLabel,
  ringComplete,
  ringShare,
} from "@/components/passport/city-ring";

const mocks = vi.hoisted(() => ({
  reduced: false,
  timings: [] as { to: number; config: unknown }[],
}));

type Props = {
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityValue?: { now: number; max: number };
  style?: unknown;
};

function flat(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return (style as Record<string, unknown> | undefined) ?? {};
}

vi.mock("react-native", () => ({
  View: vi.fn(
    ({
      children,
      testID,
      accessibilityLabel,
      accessibilityRole,
      accessibilityValue,
    }: Props) => (
      <div
        data-testid={testID}
        aria-label={accessibilityLabel}
        role={accessibilityRole}
        data-now={accessibilityValue?.now}
        data-max={accessibilityValue?.max}
      >
        {children}
      </div>
    ),
  ),
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(({ testID, style }: Props) => {
      const { opacity, transform } = flat(style) as {
        opacity?: number;
        transform?: { rotate: string }[];
      };
      return (
        <div
          data-testid={testID}
          data-opacity={opacity}
          data-rotate={transform?.[0]?.rotate}
        />
      );
    }),
  },
  useReducedMotion: () => mocks.reduced,
  useSharedValue: (value: number) =>
    useState(() => {
      let current = value;
      return {
        get: () => current,
        set: (next: number | { to: number }) => {
          current = typeof next === "number" ? next : next.to;
        },
      };
    })[0],
  useAnimatedStyle: (worklet: () => unknown) => worklet(),
  withTiming: (to: number, config: unknown) => {
    mocks.timings.push({ to, config });
    return { to };
  },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("@/components/symbol", () => ({
  AppSymbolIcon: vi.fn(({ name }: { name: string }) => (
    <i data-testid={name} />
  )),
}));
vi.mock("@/lib/motion", () => ({ motion: { timing: { enter: "enter" } } }));
vi.mock("@/lib/i18n", () => ({
  useAppLocale: () => "en",
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

beforeEach(() => {
  mocks.reduced = false;
  mocks.timings = [];
});

afterEach(cleanup);

describe("ring maths", () => {
  it("fills by the share stamped and never past full", () => {
    expect(ringShare({ stamped: 7, total: 12 })).toBeCloseTo(7 / 12);
    expect(ringShare({ stamped: 5, total: 5 })).toBe(1);
    expect(ringShare({ stamped: 6, total: 5 })).toBe(1);
    expect(ringShare({ stamped: 0, total: 0 })).toBe(0);
  });

  it("is complete only when every place is stamped", () => {
    expect(ringComplete({ stamped: 5, total: 5 })).toBe(true);
    expect(ringComplete({ stamped: 7, total: 13 })).toBe(false);
    expect(ringComplete({ stamped: 0, total: 0 })).toBe(false);
  });
});

describe("CityRing", () => {
  it("reads as stamped of total in the city", () => {
    render(<CityRing stamped={7} total={12} city="Lisbon" />);
    const ring = screen.getByTestId("city-ring");
    expect(ring.getAttribute("aria-label")).toBe(
      'passport.ringLabel {"count":12,"visited":7,"city":"Lisbon"}',
    );
    expect(ring.getAttribute("role")).toBe("progressbar");
    expect(ring.dataset.now).toBe("7");
    expect(ring.dataset.max).toBe("12");
    expect(cityRingLabel({ stamped: 7, total: 12 }, "Lisbon", true)).toBe(
      'passport.ringLocked {"count":12,"city":"Lisbon"}',
    );
  });

  it("animates the fill to its share when motion is allowed", () => {
    render(<CityRing stamped={3} total={4} city="Lisbon" />);
    expect(mocks.timings).toEqual([{ to: 0.75, config: "enter" }]);
  });

  it("sets the fill at once under Reduce Motion", () => {
    mocks.reduced = true;
    render(<CityRing stamped={3} total={4} city="Lisbon" />);
    expect(mocks.timings).toEqual([]);
    expect(screen.getByTestId("city-ring-right").dataset.rotate).toBe("225deg");
    expect(screen.getByTestId("city-ring-left").dataset.rotate).toBe("135deg");
    expect(screen.getByTestId("city-ring-left").dataset.opacity).toBe("1");
  });

  it("shows only the right half for under half, and nothing at zero", () => {
    mocks.reduced = true;
    render(<CityRing stamped={1} total={4} city="Lisbon" />);
    expect(screen.getByTestId("city-ring-right").dataset.rotate).toBe("135deg");
    expect(screen.getByTestId("city-ring-left").dataset.opacity).toBe("0");
    cleanup();
    render(<CityRing stamped={0} total={4} city="Lisbon" />);
    expect(screen.getByTestId("city-ring-right").dataset.opacity).toBe("0");
  });

  it("turns into a filled ring with a check when the city is complete, even with stamps that have no save", () => {
    render(<CityRing stamped={5} total={5} city="Lisbon" />);
    expect(screen.getByTestId("city-ring-complete")).toBeTruthy();
    expect(screen.getByTestId("checkmark")).toBeTruthy();
    expect(screen.queryByTestId("city-ring-right")).toBeNull();
  });

  it("shows a lock and no fill for a locked preview", () => {
    render(<CityRing stamped={5} total={5} city="Lisbon" locked />);
    expect(screen.getByTestId("lock")).toBeTruthy();
    expect(screen.queryByTestId("city-ring-complete")).toBeNull();
    expect(screen.queryByTestId("city-ring-right")).toBeNull();
    const ring = screen.getByTestId("city-ring");
    expect(ring.getAttribute("aria-label")).toBe(
      'passport.ringLocked {"count":5,"city":"Lisbon"}',
    );
    expect(ring.dataset.now).toBeUndefined();
  });
});
