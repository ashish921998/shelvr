// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { sampleTrip, type SampleRow } from "@/lib/sample-trip";
import { SampleTripCard } from "./trip-teaser-card";

type ViewProps = {
  children?: ReactNode;
  accessibilityElementsHidden?: boolean;
  importantForAccessibility?: string;
  accessibilityLabel?: string;
};

const mock = vi.hoisted(() => ({
  view: ({
    children,
    accessibilityElementsHidden,
    importantForAccessibility,
    accessibilityLabel,
  }: ViewProps) => (
    <div
      data-hidden={accessibilityElementsHidden ? "true" : undefined}
      data-android-hidden={
        importantForAccessibility === "no-hide-descendants" ? "true" : undefined
      }
      aria-label={accessibilityLabel}
    >
      {children}
    </div>
  ),
  text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  icon: ({ name }: { name: string }) => <i data-testid={`icon-${name}`} />,
  map: ({ crop }: { crop: { top: number } }) => (
    <div data-testid="map" data-top={crop.top} />
  ),
  pin: ({ number, day }: { number: number; day: number }) => (
    <i data-testid="pin" data-day={day}>
      {number}
    </i>
  ),
  veiled: ({ rows }: { rows: readonly SampleRow[] }) => (
    <div data-testid="veiled">
      {rows.map((row, index) => (
        <span key={index}>
          {row.kind === "day" ? `day ${row.day}` : row.entry.stop.name}
        </span>
      ))}
    </div>
  ),
}));

vi.mock("react-native", () => ({ View: mock.view, Text: mock.text }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { foreground: "#000" } } }),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: mock.icon }));
vi.mock("@/components/onboarding/sample-trip-map", () => ({
  SampleTripMap: mock.map,
  PinBadge: mock.pin,
}));
vi.mock("@/components/onboarding/veiled-stops", () => ({
  VeiledStops: mock.veiled,
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: object) =>
    values === undefined ? key : `${key}:${JSON.stringify(values)}`,
  useAppLocale: () => "en",
}));

const TRIP = sampleTrip("prague");
const STOPS = TRIP.days.flatMap((day) => day.stops.map((stop) => stop.name));
const veiledAncestor = (element: HTMLElement) =>
  element.closest('[data-hidden="true"]');

describe("SampleTripCard open", () => {
  it("shows both days and all eight stops, none of them hidden", () => {
    render(<SampleTripCard trip={TRIP} locked={false} />);
    for (const name of STOPS) {
      expect(veiledAncestor(screen.getByText(name))).toBeNull();
    }
    expect(screen.getByText('trip.dayTab:{"day":"1"}')).toBeTruthy();
    expect(screen.getByText('trip.dayTab:{"day":"2"}')).toBeTruthy();
    expect(screen.getByText("tripTeaser.pragueDayOne")).toBeTruthy();
    expect(screen.getByText("tripTeaser.pragueDayTwo")).toBeTruthy();
  });

  it("counts the places in each day", () => {
    render(<SampleTripCard trip={TRIP} locked={false} />);
    expect(
      screen.getAllByText('tripTeaser.placeCount:{"count":4}'),
    ).toHaveLength(2);
  });

  it("labels each stop with its time of day", () => {
    render(<SampleTripCard trip={TRIP} locked={false} />);
    for (const slot of [
      "trip.slotMorning",
      "trip.slotLunch",
      "trip.slotAfternoon",
      "trip.slotDinner",
    ]) {
      expect(screen.getAllByText(slot)).toHaveLength(2);
    }
  });

  it("numbers the pins 1 to 8, the first day apart from the second", () => {
    render(<SampleTripCard trip={TRIP} locked={false} />);
    const pins = screen.getAllByTestId("pin");
    expect(pins.map((pin) => pin.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
    expect(pins.map((pin) => pin.dataset.day)).toEqual([
      "0",
      "0",
      "0",
      "0",
      "1",
      "1",
      "1",
      "1",
    ]);
  });

  it("says it is a sample, shows the taller map and has no lock or blur", () => {
    render(<SampleTripCard trip={TRIP} locked={false} />);
    expect(screen.getByText("tripTeaser.sampleBadge")).toBeTruthy();
    expect(screen.getByTestId("map").dataset.top).toBe("10");
    expect(screen.queryByLabelText("tripTeaser.lockedLabel")).toBeNull();
    expect(screen.queryByTestId("veiled")).toBeNull();
  });
});

describe("SampleTripCard locked", () => {
  it("shows the first stop clearly", () => {
    render(<SampleTripCard trip={TRIP} locked />);
    expect(veiledAncestor(screen.getByText("Old Town Square"))).toBeNull();
    expect(screen.getByText('trip.dayTab:{"day":"1"}')).toBeTruthy();
    expect(
      veiledAncestor(screen.getByText('trip.dayTab:{"day":"1"}')),
    ).toBeNull();
  });

  it("hands every other stop and the second day to the blurred stops", () => {
    render(<SampleTripCard trip={TRIP} locked />);
    const rows = Array.from(screen.getByTestId("veiled").children);
    expect(rows.map((row) => row.textContent)).toEqual([
      ...STOPS.slice(1, 4),
      "day 1",
      ...STOPS.slice(4),
    ]);
  });

  it("hides the blurred stops from screen readers on both platforms", () => {
    render(<SampleTripCard trip={TRIP} locked />);
    const hidden = veiledAncestor(screen.getByTestId("veiled"));
    expect(hidden).not.toBeNull();
    expect(hidden?.getAttribute("data-android-hidden")).toBe("true");
  });

  it("draws only the clear stop as a pin, the rest are drawn blurred", () => {
    render(<SampleTripCard trip={TRIP} locked />);
    expect(screen.getAllByTestId("pin").map((pin) => pin.textContent)).toEqual([
      "1",
    ]);
  });

  it("puts one labelled lock outside the hidden rows", () => {
    render(<SampleTripCard trip={TRIP} locked />);
    const lock = screen.getByLabelText("tripTeaser.lockedLabel");
    expect(veiledAncestor(lock)).toBeNull();
    expect(screen.getAllByTestId("icon-lock")).toHaveLength(1);
  });

  it("shows the shorter map", () => {
    render(<SampleTripCard trip={TRIP} locked />);
    expect(screen.getByTestId("map").dataset.top).toBe("28");
  });
});
