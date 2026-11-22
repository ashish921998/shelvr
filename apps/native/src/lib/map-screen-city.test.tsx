// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import MapScreen from "@/app/(app)/(tabs)/(map)/index";

const mocks = vi.hoisted(() => ({
  setCity: vi.fn(),
  params: {} as Record<string, string>,
  frame: undefined as { key: string; places: { city: string }[] } | undefined,
  centre: undefined as
    | ((c: object, zoom: number, moved?: boolean) => void)
    | undefined,
  places: [] as object[],
  flight: undefined as
    | { key: number; places: object[]; minZoom?: number; maxZoom?: number }
    | undefined,
  pills: [] as { id: string; text: string }[],
  pill: undefined as ((id: string) => void) | undefined,
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
const place = (name: string, city: string, lat: number, lng = -9) => ({
  itemId: name,
  name,
  city,
  lat,
  lng,
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
    data: mocks.places,
  }),
}));
vi.mock("@/components/map/map-trip-pill", () => ({
  MapTripPill: vi.fn(() => null),
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useRouter: () => ({ push: vi.fn() }),
    useLocalSearchParams: () => mocks.params,
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
      heading,
      back,
    }: {
      city?: string;
      heading?: string;
      back?: { label: string; onPress: () => void };
    }) => (
      <div>
        <span>{city ?? heading ?? "wordmark"}</span>
        {back ? (
          <button aria-label={back.label} onClick={back.onPress} />
        ) : null}
      </div>
    ),
  ),
}));
vi.mock("@/components/map/places-map", () => ({
  PlacesMap: vi.fn(
    (props: {
      onCentreChange: (c: object, zoom: number, moved?: boolean) => void;
      flight?: typeof mocks.flight;
      pills: typeof mocks.pills;
      onPill: (id: string) => void;
      height: number;
      bottomInset: number;
      pins: { id: string }[];
      onSelect: (id: string) => void;
      frame?: typeof mocks.frame;
    }) => {
      mocks.frame = props.frame;
      mocks.pins = props.pins;
      mocks.select = props.onSelect;
      mocks.centre = props.onCentreChange;
      mocks.flight = props.flight;
      mocks.pills = props.pills;
      mocks.pill = props.onPill;
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
  mocks.params = {};
  mocks.places = [place("A", "Lisbon", 38.7), place("B", "Porto", 41.1)];
});

it("tells the tab bar which city is in view, and clears it when zoomed out", () => {
  render(<MapScreen />);
  expect(mocks.setCity).toHaveBeenLastCalledWith("Lisbon");

  act(() => mocks.centre?.({ lat: 41.1, lng: -9 }, 12));
  expect(mocks.setCity).toHaveBeenLastCalledWith("Porto");
  expect(screen.getByText("Porto")).toBeTruthy();

  act(() => mocks.centre?.({ lat: 40, lng: -9 }, 6));
  expect(mocks.setCity).toHaveBeenLastCalledWith(undefined);
});

it("steps from a city to its country to every city, with a pill per city once zoomed out", () => {
  render(<MapScreen />);
  expect(screen.getByText("Lisbon")).toBeTruthy();
  expect(mocks.pills).toEqual([]);

  fireEvent.click(screen.getByLabelText("map.showCountry"));
  expect(mocks.flight?.key).toBe(1);
  expect(mocks.flight?.places).toHaveLength(2);

  act(() => mocks.centre?.({ lat: 40, lng: -9 }, 6));
  expect(screen.getByText("Portugal")).toBeTruthy();
  expect(mocks.pills.map((pill) => pill.id)).toEqual(["lisbon", "porto"]);
  expect(mocks.pins).toEqual([]);

  fireEvent.click(screen.getByLabelText("map.showAllCities"));
  expect(mocks.flight?.key).toBe(2);
  act(() => mocks.centre?.({ lat: 40, lng: -9 }, 1));
  expect(screen.getByText("map.yourCities")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();

  act(() => mocks.pill?.("porto"));
  expect(mocks.flight?.key).toBe(3);
  expect(mocks.flight?.minZoom).toBeGreaterThan(9);
});

it("keeps the country it stepped to until the map is moved, though another country's city is nearer", () => {
  mocks.places = [
    place("A", "Berlin", 52.52, 13.4),
    place("C", "Berlin", 52.53, 13.41),
    place("B", "Munich", 48.14, 11.58),
    place("D", "Prague", 50.08, 14.44),
  ];
  render(<MapScreen />);
  fireEvent.click(screen.getByLabelText("map.showCountry"));

  act(() => mocks.centre?.({ lat: 50.33, lng: 12.5 }, 5, false));
  expect(screen.getByText("Germany")).toBeTruthy();

  act(() => mocks.centre?.({ lat: 50.33, lng: 12.5 }, 5, true));
  expect(screen.getByText("Czechia")).toBeTruthy();
});

it("reads every city as the level even where the map cannot zoom out that far", () => {
  render(<MapScreen />);
  fireEvent.click(screen.getByLabelText("map.showCountry"));
  fireEvent.click(screen.getByLabelText("map.showAllCities"));
  act(() => mocks.centre?.({ lat: 40, lng: -9 }, 3, false));
  expect(screen.getByText("map.yourCities")).toBeTruthy();
});

it.each([1.1, 1.6, 2, 2.4, 3, 5])(
  "keeps a country through a nudge when its flight lands at zoom %s",
  (zoom) => {
    mocks.places = [
      place("A", "New York", 40.71, -74.01),
      place("B", "New York", 40.72, -74),
      place("C", "Los Angeles", 34.05, -118.24),
      place("D", "Paris", 48.86, 2.35),
    ];
    render(<MapScreen />);
    fireEvent.click(screen.getByLabelText("map.showCountry"));
    act(() => mocks.centre?.({ lat: 37.4, lng: -96.1 }, zoom, false));

    act(() => mocks.centre?.({ lat: 37.41, lng: -96.11 }, zoom, true));
    expect(screen.getByText("United States")).toBeTruthy();
    expect(screen.getByLabelText("map.showAllCities")).toBeTruthy();

    act(() => mocks.centre?.({ lat: 37.41, lng: -96.11 }, zoom - 1, true));
    if (zoom - 1 < 2.5) expect(screen.getByText("map.yourCities")).toBeTruthy();
  },
);

it.each([1, 2, 3, 4.2])(
  "keeps every city through a nudge when its flight lands at zoom %s",
  (zoom) => {
    render(<MapScreen />);
    fireEvent.click(screen.getByLabelText("map.showCountry"));
    fireEvent.click(screen.getByLabelText("map.showAllCities"));
    act(() => mocks.centre?.({ lat: 40, lng: -9 }, zoom, false));

    act(() => mocks.centre?.({ lat: 40.01, lng: -9.01 }, zoom, true));
    expect(screen.getByText("map.yourCities")).toBeTruthy();
  },
);

it("keeps every city through a nudge when the step up to it did not move the map", () => {
  render(<MapScreen />);
  fireEvent.click(screen.getByLabelText("map.showCountry"));
  act(() => mocks.centre?.({ lat: 40, lng: -9 }, 3, false));
  fireEvent.click(screen.getByLabelText("map.showAllCities"));

  act(() => mocks.centre?.({ lat: 40.01, lng: -9.01 }, 3, true));
  expect(screen.getByText("map.yourCities")).toBeTruthy();
});

it("gives the tab bar the city in the title after a pill tap", () => {
  mocks.places = [
    place("A", "Los Angeles", 34.05, -118.25),
    place("B", "Los Angeles", 33.99, -118.47),
    place("C", "Beverly Hills", 34.07, -118.4),
  ];
  render(<MapScreen />);
  act(() => mocks.pill?.("los angeles"));
  act(() => mocks.centre?.({ lat: 34.02, lng: -118.36 }, 10, false));
  expect(screen.getByText("Los Angeles")).toBeTruthy();
  expect(mocks.setCity).toHaveBeenLastCalledWith("Los Angeles");

  act(() => mocks.centre?.({ lat: 34.06, lng: -118.39 }, 10, true));
  expect(screen.getByText("Beverly Hills")).toBeTruthy();
  expect(mocks.setCity).toHaveBeenLastCalledWith("Beverly Hills");
});

it("lets go of a city it flew to once that city's saves are gone", () => {
  const { rerender } = render(<MapScreen />);
  act(() => mocks.pill?.("porto"));
  act(() => mocks.centre?.({ lat: 41.1, lng: -9 }, 10, false));
  expect(screen.getByText("Porto")).toBeTruthy();

  mocks.places = [place("A", "Lisbon", 38.7)];
  rerender(<MapScreen />);
  expect(screen.queryByText("Porto")).toBeNull();
  expect(mocks.setCity).toHaveBeenLastCalledWith(undefined);
});

it("lets go of every city once there are no saves", () => {
  const { rerender } = render(<MapScreen />);
  fireEvent.click(screen.getByLabelText("map.showCountry"));
  fireEvent.click(screen.getByLabelText("map.showAllCities"));
  mocks.places = [];
  rerender(<MapScreen />);
  expect(screen.queryByText("map.yourCities")).toBeNull();
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

  act(() => mocks.centre?.({ lat: 40, lng: -9 }, 6, true));
  expect(mocks.pins.map((pin) => pin.id)).toEqual(["discover:p1"]);

  act(() => mocks.went?.("want"));
  expect(mocks.pins.map((pin) => pin.id)).not.toContain("discover:p1");
});

it("frames the city a share just added to, keyed by its save", () => {
  mocks.params = { city: "porto", save: "save-1" };
  render(<MapScreen />);
  expect(mocks.frame?.key).toBe("save-1");
  expect(mocks.frame?.places.map((p) => p.city)).toEqual(["Porto"]);
});

it("leaves the framing alone without a shared city", () => {
  render(<MapScreen />);
  expect(mocks.frame).toBeUndefined();
});

it("clears the went switch so a shared city's places show", () => {
  const { rerender } = render(<MapScreen />);
  act(() => mocks.went?.("went"));
  expect(mocks.pins.some((pin) => pin.id.startsWith("B:"))).toBe(false);
  mocks.params = { city: "porto", save: "save-1" };
  rerender(<MapScreen />);
  expect(mocks.pins.some((pin) => pin.id.startsWith("B:"))).toBe(true);
});
