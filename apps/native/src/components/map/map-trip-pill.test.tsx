// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { MapTripPill } from "./map-trip-pill";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  useTrip: vi.fn(),
  next: null as null | {
    trip: { _id: string; city: string; name?: string };
    inProgress: boolean;
  },
}));

vi.mock("@/lib/use-trip-to-continue", () => ({
  useTripToContinue: (city: string | undefined) => {
    mocks.useTrip(city);
    return mocks.next;
  },
}));
vi.mock("@/lib/trip-planner", () => ({
  tripName: (trip: { name?: string; city: string }) =>
    trip.name ?? `${trip.city} trip`,
}));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: vi.fn() } }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, params: { name: string }) => `${key} ${params.name}`,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.next = null;
});

it("shows nothing without a trip under way or about to start", () => {
  const { container } = render(<MapTripPill city="Kyoto" />);
  expect(container.innerHTML).toBe("");
});

it.each([["New York"], [undefined]])(
  "asks for a trip in the city the map shows: %s",
  (city) => {
    render(<MapTripPill city={city} />);
    expect(mocks.useTrip).toHaveBeenCalledWith(city);
  },
);

it("opens the trip", () => {
  mocks.next = {
    trip: { _id: "trip1", city: "Kyoto", name: "Autumn in Kyoto" },
    inProgress: false,
  };
  render(<MapTripPill city="kyoto" />);
  fireEvent.click(
    screen.getByRole("button", { name: "map.continueTrip Autumn in Kyoto" }),
  );
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/trip-plan/[id]",
    params: { id: "trip1" },
  });
});
