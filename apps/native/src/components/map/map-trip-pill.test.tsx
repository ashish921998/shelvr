// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { MapTripPill } from "./map-trip-pill";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  capture: vi.fn(),
  next: null as null | {
    trip: { _id: string; city: string; name?: string };
    inProgress: boolean;
  },
}));

vi.mock("@/lib/use-trip-to-continue", () => ({
  useTripToContinue: () => mocks.next,
}));
vi.mock("@/lib/trip-planner", () => ({
  tripName: (trip: { name?: string; city: string }) =>
    trip.name ?? `${trip.city} trip`,
  sameCity: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
}));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mocks.capture } }));
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
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
    }) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {children}
      </button>
    ),
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.next = null;
});

it("shows nothing without a trip under way or about to start", () => {
  const { container } = render(<MapTripPill city="Kyoto" />);
  expect(container.innerHTML).toBe("");
});

it.each([
  ["another city", "New York"],
  ["no city", undefined],
])("hides a trip while the map shows %s", (_name, city) => {
  mocks.next = {
    trip: { _id: "trip1", city: "Austin", name: "Austin weekend" },
    inProgress: false,
  };
  const { container } = render(<MapTripPill city={city} />);
  expect(container.innerHTML).toBe("");
});

it("opens the trip and records whether it is under way", () => {
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
  expect(mocks.capture).toHaveBeenCalledWith("map_trip_continued", {
    in_progress: false,
  });
});
