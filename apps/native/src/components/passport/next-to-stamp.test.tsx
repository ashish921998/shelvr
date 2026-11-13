// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NextToStampList } from "@/components/passport/next-to-stamp";
import type { UnstampedPlace } from "@/lib/passport";
import type { Id } from "@convex/_generated/dataModel";

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
  ScrollView: vi.fn(({ children }: Props) => <div>{children}</div>),
  View: vi.fn(({ children }: Props) => <div>{children}</div>),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
    absoluteFill: {},
    hairlineWidth: 1,
  },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => <img alt="" />) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: Props) => <span>{children}</span>),
}));
vi.mock("@/components/passport/city-ring", () => ({
  CityRing: vi.fn(({ stamped, total }: { stamped: number; total: number }) => (
    <i data-testid="ring">{`${stamped}/${total}`}</i>
  )),
}));
vi.mock("@/lib/i18n", () => ({
  useAppLocale: () => "en",
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

const ITEM = "item-1" as Id<"items">;
const place = (name: string): UnstampedPlace => ({
  itemId: ITEM,
  name,
  city: "Lisbon",
  spot: { lat: 38.7, lng: -9.1 },
  cover: null,
  title: `${name} reel`,
});

afterEach(cleanup);

describe("NextToStampList", () => {
  it("lists the city's unstamped places with a Stamp button each", () => {
    const onStamp = vi.fn();
    const places = [place("Tigre"), place("Dante")];
    render(
      <NextToStampList
        city="Lisbon"
        places={places}
        completion={{ city: "Lisbon", stamped: 7, total: 9 }}
        busy={false}
        onStamp={onStamp}
      />,
    );
    expect(screen.getByTestId("ring").textContent).toBe("7/9");
    expect(
      screen.getByText('passport.nextBody {"count":2,"city":"Lisbon"}'),
    ).toBeTruthy();
    expect(screen.getByText("Tigre")).toBeTruthy();
    expect(screen.getByText("Dante reel")).toBeTruthy();
    const buttons = screen.getAllByTestId("next-to-stamp-stamp");
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      'passport.stampPlaceLabel {"name":"Tigre"}',
      'passport.stampPlaceLabel {"name":"Dante"}',
    ]);
    fireEvent.click(buttons[1]);
    expect(onStamp).toHaveBeenCalledWith(places[1]);
  });

  it("holds every Stamp button while a stamp is being saved", () => {
    const onStamp = vi.fn();
    render(
      <NextToStampList
        city="Lisbon"
        places={[place("Tigre")]}
        completion={undefined}
        busy
        onStamp={onStamp}
      />,
    );
    const button = screen.getByTestId("next-to-stamp-stamp");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("ring")).toBeNull();
  });

  it("says the city is all stamped when nothing is left", () => {
    render(
      <NextToStampList
        city="Lisbon"
        places={[]}
        completion={{ city: "Lisbon", stamped: 5, total: 5 }}
        busy={false}
        onStamp={vi.fn()}
      />,
    );
    expect(
      screen.getByText('passport.cityAllStamped {"city":"Lisbon"}'),
    ).toBeTruthy();
    expect(screen.queryByTestId("next-to-stamp-stamp")).toBeNull();
  });
});
