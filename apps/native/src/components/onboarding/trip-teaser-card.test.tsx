// @vitest-environment jsdom
// The sample trip card: open it shows every day and stop; locked it shows the
// first stop and hands the rest to the blurred stops, hidden from screen
// readers, behind a lock.
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SampleRow } from "@/lib/sample-trip";
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

const STOPS = [
  "Old Town Square",
  "Café Louvre",
  "Charles Bridge",
  "Prague Castle",
  "Petřín Lookout Tower",
];
const veiledAncestor = (element: HTMLElement) =>
  element.closest('[data-hidden="true"]');

describe("SampleTripCard open", () => {
  it("shows both days and all five stops, none of them hidden", () => {
    render(<SampleTripCard locked={false} />);
    for (const name of STOPS) {
      expect(veiledAncestor(screen.getByText(name))).toBeNull();
    }
    expect(screen.getByText('trip.dayTab:{"day":"1"}')).toBeTruthy();
    expect(screen.getByText('trip.dayTab:{"day":"2"}')).toBeTruthy();
    expect(screen.getByText("tripTeaser.dayOneTitle")).toBeTruthy();
    expect(screen.getByText("tripTeaser.dayTwoTitle")).toBeTruthy();
  });

  it("counts the places in each day", () => {
    render(<SampleTripCard locked={false} />);
    expect(screen.getByText('tripTeaser.placeCount:{"count":3}')).toBeTruthy();
    expect(screen.getByText('tripTeaser.placeCount:{"count":2}')).toBeTruthy();
  });

  it("labels each stop with its time of day", () => {
    render(<SampleTripCard locked={false} />);
    expect(screen.getAllByText("trip.slotMorning")).toHaveLength(2);
    expect(screen.getAllByText("trip.slotAfternoon")).toHaveLength(2);
    expect(screen.getAllByText("trip.slotEvening")).toHaveLength(1);
  });

  it("numbers the pins 1 to 5, the first day apart from the second", () => {
    render(<SampleTripCard locked={false} />);
    const pins = screen.getAllByTestId("pin");
    expect(pins.map((pin) => pin.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(pins.map((pin) => pin.dataset.day)).toEqual([
      "0",
      "0",
      "0",
      "1",
      "1",
    ]);
  });

  it("says it is a sample, shows the taller map and has no lock or blur", () => {
    render(<SampleTripCard locked={false} />);
    expect(screen.getByText("tripTeaser.sampleBadge")).toBeTruthy();
    expect(screen.getByTestId("map").dataset.top).toBe("10");
    expect(screen.queryByLabelText("tripTeaser.lockedLabel")).toBeNull();
    expect(screen.queryByTestId("veiled")).toBeNull();
  });
});

describe("SampleTripCard locked", () => {
  it("shows the first stop clearly", () => {
    render(<SampleTripCard locked />);
    expect(veiledAncestor(screen.getByText("Old Town Square"))).toBeNull();
    expect(screen.getByText('trip.dayTab:{"day":"1"}')).toBeTruthy();
    expect(
      veiledAncestor(screen.getByText('trip.dayTab:{"day":"1"}')),
    ).toBeNull();
  });

  it("hands every other stop and the second day to the blurred stops", () => {
    render(<SampleTripCard locked />);
    const rows = Array.from(screen.getByTestId("veiled").children);
    expect(rows.map((row) => row.textContent)).toEqual([
      "Café Louvre",
      "Charles Bridge",
      "day 1",
      "Prague Castle",
      "Petřín Lookout Tower",
    ]);
  });

  it("hides the blurred stops from screen readers on both platforms", () => {
    render(<SampleTripCard locked />);
    const hidden = veiledAncestor(screen.getByTestId("veiled"));
    expect(hidden).not.toBeNull();
    expect(hidden?.getAttribute("data-android-hidden")).toBe("true");
  });

  it("draws only the clear stop as a pin, the rest are drawn blurred", () => {
    render(<SampleTripCard locked />);
    expect(screen.getAllByTestId("pin").map((pin) => pin.textContent)).toEqual([
      "1",
    ]);
  });

  it("puts one labelled lock outside the hidden rows", () => {
    render(<SampleTripCard locked />);
    const lock = screen.getByLabelText("tripTeaser.lockedLabel");
    expect(veiledAncestor(lock)).toBeNull();
    expect(screen.getAllByTestId("icon-lock")).toHaveLength(1);
  });

  it("shows the shorter map", () => {
    render(<SampleTripCard locked />);
    expect(screen.getByTestId("map").dataset.top).toBe("28");
  });
});
