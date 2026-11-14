// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PassportHero } from "@/components/passport/passport-hero";
import type { CityStamp } from "@/lib/city-stamp-data";
import type { Stamp } from "@/lib/passport";
import { badgeTotals } from "@convex/model/badges";

type Props = {
  children?: ReactNode;
  testID?: string;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

vi.mock("react-native", () => ({
  Pressable: vi.fn(
    ({ children, testID, onPress, disabled, accessibilityLabel }: Props) => (
      <button
        data-testid={testID}
        aria-label={accessibilityLabel}
        disabled={disabled}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
  Text: vi.fn(({ children }: Props) => <span>{children}</span>),
  View: vi.fn(({ children, testID, accessibilityLabel }: Props) => (
    <div data-testid={testID} aria-label={accessibilityLabel}>
      {children}
    </div>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("@/components/symbol", () => ({
  AppSymbolIcon: vi.fn(({ name }: { name: string }) => (
    <i data-testid={`icon-${name}`} />
  )),
}));
vi.mock("@/components/passport/stamp-sheet", () => ({
  StampArt: vi.fn(({ cover }: { cover: string | null }) => (
    <i data-testid={`place-${cover}`} />
  )),
}));
vi.mock("@/components/passport/city-stamp", () => ({
  CityStampArt: vi.fn(({ name }: { name: string }) => (
    <i data-testid={`city-${name}`} />
  )),
}));
vi.mock("@/lib/city-stamp-data", () => ({
  cityStampLabel: (city: string) => city,
}));
vi.mock("@/lib/date", () => ({ formatRecentDate: () => "14 Nov" }));
vi.mock("@/lib/passport", () => ({
  stampId: (stamp: Stamp) => stamp.name,
  stampDate: (stamp: Stamp) => (stamp.backfilled ? null : stamp.visitedAt),
}));

function stamp(name: string, city: string, visitedAt: number): Stamp {
  return {
    name,
    city,
    countryCode: "US",
    cover: name,
    visitedAt,
    backfilled: false,
    kinds: [],
  } as unknown as Stamp;
}

const AUSTIN = [
  stamp("Franklin", "Austin", 1),
  stamp("Veracruz", "Austin", 3),
  stamp("Uchi", "Houston", 2),
  stamp("Xochi", "Houston", 0),
];

function hero(
  stamps: Stamp[],
  cities: CityStamp[] = [],
  locked = false,
): { onUnlock: () => void } {
  const onUnlock = vi.fn();
  render(
    <PassportHero
      stamps={stamps}
      cityStamps={cities}
      totals={badgeTotals(
        stamps.map((s) => ({ ...s, kinds: [] })),
        [],
      )}
      locked={locked}
      onUnlock={onUnlock}
    />,
  );
  return { onUnlock };
}

afterEach(cleanup);

describe("PassportHero", () => {
  it("leads with the places stamped, where they are and the next badge", () => {
    hero(AUSTIN);
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("Places stamped")).toBeTruthy();
    expect(screen.getByText("2 cities · 1 country")).toBeTruthy();
    expect(screen.getByText("Next badge: Explorer")).toBeTruthy();
    expect(screen.getByText("4 of 10 places")).toBeTruthy();
  });

  it("reads the count as one plural phrase", () => {
    hero([stamp("Franklin", "Austin", 1)]);
    expect(screen.getByLabelText("1 place, 1 city · 1 country")).toBeTruthy();
  });

  it("piles the two newest place stamps on the city stamp", () => {
    hero(AUSTIN, [{ city: "Austin", country: "USA" } as CityStamp]);
    expect(screen.getByTestId("place-Veracruz")).toBeTruthy();
    expect(screen.getByTestId("place-Uchi")).toBeTruthy();
    expect(screen.queryByTestId("place-Franklin")).toBeNull();
    expect(screen.getByTestId("city-Austin")).toBeTruthy();
  });

  it("piles the newest city stamp, not the first by name", () => {
    hero(AUSTIN, [
      { city: "Austin", country: "US", stampedAt: 1 },
      { city: "Tokyo", country: "JP", stampedAt: 2 },
    ]);
    expect(screen.getByTestId("city-Tokyo")).toBeTruthy();
    expect(screen.queryByTestId("city-Austin")).toBeNull();
  });

  it("starts an empty passport at zero with the first badge next", () => {
    hero([]);
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("0 cities")).toBeTruthy();
    expect(screen.getByText("Next badge: First stamp")).toBeTruthy();
  });

  it("opens the upgrade from the next badge only when badges are locked", () => {
    const locked = hero(AUSTIN, [], true);
    fireEvent.click(screen.getByTestId("passport-hero-next"));
    expect(locked.onUnlock).toHaveBeenCalledOnce();
    cleanup();
    hero(AUSTIN);
    const next = screen.getByTestId("passport-hero-next");
    expect(next.tagName).toBe("DIV");
    expect(next.getAttribute("aria-label")).toBe(
      "Next badge: Explorer, 4 of 10 places",
    );
  });
});
