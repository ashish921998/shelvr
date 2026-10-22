// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { samplePlan, sampleTrip } from "@/lib/sample-trip";
import { SampleTripCard } from "./trip-teaser-card";

type ViewProps = { children?: ReactNode; accessibilityLabel?: string };

const mock = vi.hoisted(() => ({
  view: ({ children, accessibilityLabel }: ViewProps) => (
    <div aria-label={accessibilityLabel}>{children}</div>
  ),
  text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  map: ({ crop }: { crop: { top: number } }) => (
    <div data-testid="map" data-top={crop.top} />
  ),
  pin: ({ number, day }: { number: number; day: number }) => (
    <i data-testid="pin" data-day={day}>
      {number}
    </i>
  ),
}));

vi.mock("react-native", () => ({ View: mock.view, Text: mock.text }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("@/components/onboarding/sample-trip-map", () => ({
  SampleTripMap: mock.map,
  PinBadge: mock.pin,
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: object) =>
    values === undefined ? key : `${key}:${JSON.stringify(values)}`,
  useAppLocale: () => "en",
}));

const TRIP = sampleTrip("prague");
const STOPS = TRIP.days.flatMap((day) => day.stops.map((stop) => stop.name));

describe("SampleTripCard open", () => {
  it("shows both days and all eight stops, none of them hidden", () => {
    render(<SampleTripCard trip={TRIP} />);
    for (const name of STOPS) expect(screen.getByText(name)).toBeTruthy();
    expect(screen.getByText('trip.dayTab:{"day":"1"}')).toBeTruthy();
    expect(screen.getByText('trip.dayTab:{"day":"2"}')).toBeTruthy();
    expect(screen.getByText("tripTeaser.pragueDayOne")).toBeTruthy();
    expect(screen.getByText("tripTeaser.pragueDayTwo")).toBeTruthy();
  });

  it("counts the places in each day", () => {
    render(<SampleTripCard trip={TRIP} />);
    expect(
      screen.getAllByText('tripTeaser.placeCount:{"count":4}'),
    ).toHaveLength(2);
  });

  it("labels each stop with its time of day", () => {
    render(<SampleTripCard trip={TRIP} />);
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
    render(<SampleTripCard trip={TRIP} />);
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

  it("says it is a sample trip and shows the map", () => {
    render(<SampleTripCard trip={TRIP} />);
    expect(screen.getByText("tripTeaser.sampleBadge")).toBeTruthy();
    expect(screen.getByTestId("map").dataset.top).toBe("10");
  });
});

describe("SampleTripCard date night and weekend", () => {
  it("shows a date night as one evening, with no day number", () => {
    render(<SampleTripCard trip={samplePlan("date", "paris")} />);
    expect(screen.getByText("plan.sampleDateBadge")).toBeTruthy();
    expect(screen.getByText("plan.dateNight")).toBeTruthy();
    expect(screen.queryByText(/trip\.dayTab/)).toBeNull();
    for (const slot of [
      "trip.slotDinner",
      "trip.slotDrinks",
      "trip.slotDessert",
      "trip.slotWalk",
    ]) {
      expect(screen.getByText(slot)).toBeTruthy();
    }
  });

  it("shows a weekend as Saturday and Sunday, with no day numbers", () => {
    render(<SampleTripCard trip={samplePlan("weekend", "london")} />);
    expect(screen.getByText("plan.sampleWeekendBadge")).toBeTruthy();
    expect(screen.getByText("plan.saturday")).toBeTruthy();
    expect(screen.getByText("plan.sunday")).toBeTruthy();
    expect(screen.queryByText(/trip\.dayTab/)).toBeNull();
  });
});
