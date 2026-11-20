// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import MapScreen from "@/app/(app)/(tabs)/(map)/index";

const mocks = vi.hoisted(() => ({
  setCity: vi.fn(),
  centre: undefined as ((c: object, zoom: number) => void) | undefined,
  zoomOut: undefined as number | undefined,
  viewport: undefined as { height: number; bottomInset: number } | undefined,
  pins: [] as { id: string }[],
  select: undefined as ((id: string) => void) | undefined,
  chips: undefined as { kinds: string[] } | undefined,
  went: undefined as ((value: string) => void) | undefined,
  discover: {
    settled: true,
    areaLoaded: true,
    areaPartial: false,
    beside: [] as object[],
    open: vi.fn(),
  },
}));
const place = (name: string, city: string, lat: number) => ({
  itemId: name,
  name,
  city,
  lat,
  lng: -9,
  kinds: [],
});

vi.mock("@/lib/map-city-in-view", () => ({ setMapCityInView: mocks.setCity }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/map-location", () => ({ useMapLocation: () => "denied" }));
vi.mock("@/lib/use-discover-places", () => ({
  useDiscoverPlaces: () => mocks.discover,
}));
vi.mock("@/lib/apple-place-card", () => ({
  canOpenPlaceCard: () => false,
  openPlaceDetails: vi.fn(),
  cancelPlaceDetails: vi.fn(),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { mapPlaces: { listMapPlaces: "listMapPlaces" } },
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    isError: false,
    data: [place("A", "Lisbon", 38.7), place("B", "Porto", 41.1)],
  }),
}));
vi.mock("@/components/map/map-trip-pill", () => ({
  MapTripPill: vi.fn(() => null),
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useRouter: () => ({ push: vi.fn() }),
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});
vi.mock("expo-router/js-tabs", () => ({ useBottomTabBarHeight: () => 80 }));
vi.mock("@/components/back-circle", () => ({
  BackCircle: vi.fn(
    ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button aria-label={label} onClick={onPress} />
    ),
  ),
}));
vi.mock("@/components/map/map-header", () => ({
  MAP_HEADER_HEIGHT: 50,
  MapHeader: vi.fn(
    ({
      city,
      onShowAllCities,
    }: {
      city?: string;
      onShowAllCities?: () => void;
    }) => (
      <div>
        <span>{city ?? "wordmark"}</span>
        {onShowAllCities ? (
          <button aria-label="all" onClick={onShowAllCities} />
        ) : null}
      </div>
    ),
  ),
}));
vi.mock("@/components/map/places-map", () => ({
  PlacesMap: vi.fn(
    (props: {
      onCentreChange: (c: object, zoom: number) => void;
      zoomOut: number;
      height: number;
      bottomInset: number;
      pins: { id: string }[];
      onSelect: (id: string) => void;
    }) => {
      mocks.pins = props.pins;
      mocks.select = props.onSelect;
      mocks.centre = props.onCentreChange;
      mocks.zoomOut = props.zoomOut;
      mocks.viewport = props;
      return null;
    },
  ),
}));
vi.mock("@/components/map/map-search", () => ({
  MapSearchResults: vi.fn(() => null),
}));
vi.mock("@/components/map/map-empty", () => ({ MapEmpty: vi.fn(() => null) }));
vi.mock("@/components/map/map-filter-chips", () => ({
  MapFilterChips: vi.fn((props: typeof mocks.chips) => {
    mocks.chips = props;
    return null;
  }),
}));
vi.mock("@/components/map/map-round-button", () => ({
  MapRoundButton: vi.fn(() => null),
}));
vi.mock("@/components/map/map-went-switch", () => ({
  MapWentSwitch: vi.fn(({ onSelect }: { onSelect: (v: string) => void }) => {
    mocks.went = onSelect;
    return null;
  }),
}));
vi.mock("@/lib/use-place-visit", () => ({
  usePlaceVisits: () => ({
    visits: [],
    loaded: true,
    isError: false,
    error: null,
    offerRetry: vi.fn(),
  }),
}));
vi.mock("@convex/model/placeVisits", () => ({
  visitMatcher: () => (place: { name: string }) => place.name === "A",
}));
vi.mock("@/lib/appearance", () => ({ isDarkThemeName: () => false }));
vi.mock("@/components/empty-state", () => ({ EmptyState: vi.fn(() => null) }));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => null),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFillObject: {} },
  useUnistyles: () => ({
    theme: { gap: (n: number) => n * 8, colors: { muted: "#999" } },
    rt: { insets: { top: 0 } },
  }),
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() },
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  View: vi.fn(
    ({
      children,
      onLayout,
    }: {
      children: ReactNode;
      onLayout?: (e: object) => void;
    }) => (
      <div
        ref={(el) => {
          if (el) onLayout?.({ nativeEvent: { layout: { height: 800 } } });
        }}
      >
        {children}
      </div>
    ),
  ),
}));

beforeEach(() => {
  mocks.setCity.mockClear();
  mocks.discover = {
    settled: true,
    areaLoaded: true,
    areaPartial: false,
    beside: [],
    open: vi.fn(),
  };
  mocks.chips = undefined;
});

it("tells the tab bar which city is in view, and clears it when zoomed out to every place", () => {
  render(<MapScreen />);
  expect(mocks.setCity).toHaveBeenLastCalledWith("Lisbon");

  act(() => mocks.centre?.({ lat: 41.1, lng: -9 }, 12));
  expect(mocks.setCity).toHaveBeenLastCalledWith("Porto");
  expect(screen.getByText("Porto")).toBeTruthy();

  fireEvent.click(screen.getByLabelText("all"));
  expect(mocks.zoomOut).toBe(1);
  act(() => mocks.centre?.({ lat: 40, lng: -9 }, 6));
  expect(mocks.setCity).toHaveBeenLastCalledWith(undefined);
  expect(screen.getByText("wordmark")).toBeTruthy();
});

it("keeps the map behind the floating controls while framing places above them", () => {
  render(<MapScreen />);
  expect(mocks.viewport?.height).toBe(800);
  expect(mocks.viewport?.bottomInset).toBeGreaterThan(80);
});

it("shows Discover places beside the person's own while the went switch is on All, and opens them", () => {
  const cafe = {
    _id: "p1",
    name: "Cafe",
    city: "Lisbon",
    lat: 38.71,
    lng: -9.1,
    appleId: "apple-1",
    kinds: ["coffee"],
  };
  mocks.discover = {
    settled: true,
    areaLoaded: true,
    areaPartial: false,
    beside: [cafe],
    open: vi.fn(),
  };
  render(<MapScreen />);
  expect(mocks.pins.map((pin) => pin.id)).toContain("discover:p1");

  act(() => mocks.select?.("discover:p1"));
  expect(mocks.discover.open).toHaveBeenCalledWith(
    expect.objectContaining({ _id: "p1", source: "discover" }),
  );

  act(() => mocks.went?.("want"));
  expect(mocks.pins.map((pin) => pin.id)).not.toContain("discover:p1");
});
