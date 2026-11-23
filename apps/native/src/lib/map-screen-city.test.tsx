// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import MapScreen from "@/app/(app)/(tabs)/(map)/index";

const mocks = vi.hoisted(() => ({
  setCity: vi.fn(),
  params: {} as Record<string, string>,
  places: undefined as object[] | undefined,
  location: "denied",
  area: undefined as ((box: object) => void) | undefined,
  frame: undefined as { key: string; places: { city: string }[] } | undefined,
  centre: undefined as ((c: object, zoom: number) => void) | undefined,
  zoomOut: undefined as number | undefined,
  known: undefined as Set<string> | undefined,
  writeKnown: vi.fn(),
  opening: undefined as { kind: string } | undefined,
  closeTouch: undefined as (() => void) | undefined,
  viewport: undefined as
    | { height: number; bottomInset: number; searchOpen: boolean }
    | undefined,
  pins: [] as { id: string; title?: string; tintColor?: string }[],
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

vi.mock("@/lib/map-opening-store", () => ({
  readLastView: () => undefined,
  readKnownSaves: () => mocks.known,
  writeKnownSaves: mocks.writeKnown,
}));
vi.mock("@/lib/map-city-in-view", () => ({ setMapCityInView: mocks.setCity }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/map-location", () => ({ useMapLocation: () => mocks.location }));
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
    data: mocks.places ?? [
      place("A", "Lisbon", 38.7),
      place("B", "Porto", 41.1),
    ],
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
      onShowAllCities,
      onOpenSearch,
    }: {
      city?: string;
      onShowAllCities?: () => void;
      onOpenSearch: () => void;
    }) => (
      <div>
        <button aria-label="search" onClick={onOpenSearch} />
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
      searchOpen: boolean;
      pins: { id: string }[];
      onSelect: (id: string) => void;
      frame?: typeof mocks.frame;
      onArea: (box: object) => void;
      opening: typeof mocks.opening;
      onTouch: () => void;
    }) => {
      mocks.opening = props.opening;
      mocks.closeTouch = props.onTouch;
      mocks.area = props.onArea;
      mocks.frame = props.frame;
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
vi.mock("@/components/map/map-empty", () => ({
  MapEmpty: vi.fn(({ located }: { located: boolean }) => (
    <div data-testid="empty">{located ? <i data-testid="locate" /> : null}</div>
  )),
}));
vi.mock("@/components/map/map-shared-lists", () => ({
  MapSharedLists: vi.fn(() => <div data-testid="lists-only" />),
}));
vi.mock("@/components/map/map-kind-row", () => ({
  MapKindRow: vi.fn((props: typeof mocks.chips) => {
    mocks.chips = props;
    return null;
  }),
}));
vi.mock("@/components/map/map-round-button", () => ({
  MapRoundButton: vi.fn(({ label }: { label: string }) =>
    label === "map.showMyLocation" ? <i data-testid="locate" /> : null,
  ),
}));
vi.mock("@/components/map/map-went-switch", () => ({
  MapWentSwitch: vi.fn(({ onSelect }: { onSelect: (v: string) => void }) => {
    mocks.went = onSelect;
    return <span data-testid="went" />;
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
  StyleSheet: {
    create: () => new Proxy({}, { get: (_, name) => ({ name }) }),
    absoluteFillObject: {},
  },
  useUnistyles: () => ({
    theme: { gap: (n: number) => n * 8, colors: { muted: "#999" } },
    rt: { insets: { top: 0 } },
  }),
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() },
  ScrollView: vi.fn(
    ({
      children,
      horizontal,
    }: {
      children: ReactNode;
      horizontal?: boolean;
    }) => <div data-horizontal={horizontal}>{children}</div>,
  ),
  View: vi.fn(
    ({
      children,
      onLayout,
      style,
    }: {
      children: ReactNode;
      onLayout?: (e: object) => void;
      style?: unknown;
    }) => (
      <div
        ref={(el) => {
          const controls = [style]
            .flat()
            .some((part) => (part as { name?: string })?.name === "controls");
          if (el)
            onLayout?.({
              nativeEvent: { layout: { height: controls ? 50 : 800 } },
            });
        }}
      >
        {children}
      </div>
    ),
  ),
}));

beforeEach(() => {
  mocks.setCity.mockClear();
  mocks.places = undefined;
  mocks.location = "denied";
  mocks.discover = {
    settled: true,
    areaLoaded: true,
    areaPartial: false,
    beside: [],
    open: vi.fn(),
  };
  mocks.chips = undefined;
  mocks.params = {};
  mocks.known = undefined;
  mocks.opening = undefined;
  mocks.writeKnown.mockClear();
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

it("marks a visited place by its title and badge, without recoloring its pin", () => {
  render(<MapScreen />);
  const [visited, unvisited] = ["A:", "B:"].map((prefix) =>
    mocks.pins.find((pin) => pin.id.startsWith(prefix)),
  );
  expect(visited).toMatchObject({ visited: true, title: "✓ A" });
  expect(visited?.tintColor).toBeUndefined();
  expect(unvisited).toMatchObject({ visited: false });
});

it("keeps the map behind the floating controls while framing places above them", () => {
  render(<MapScreen />);
  expect(mocks.viewport?.height).toBe(800);
  expect(mocks.viewport?.bottomInset).toBeGreaterThan(80);
});

it("tells the map when Search hides the went switch", () => {
  render(<MapScreen />);
  expect(mocks.viewport?.searchOpen).toBe(false);
  fireEvent.click(screen.getByLabelText("search"));
  expect(screen.queryByTestId("went")).toBeNull();
  expect(mocks.viewport?.searchOpen).toBe(true);
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

it("lets the went switch scroll sideways when large text makes it wider than the screen", () => {
  render(<MapScreen />);
  expect(screen.getByTestId("went").closest("[data-horizontal]")).toBeTruthy();
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

it("opens on the city of a save the device has not seen, keyed by that save", () => {
  mocks.known = new Set(["B"]);
  render(<MapScreen />);
  expect(mocks.frame?.key).toBe("A");
  expect(mocks.frame?.places.map((p) => p.city)).toEqual(["Lisbon"]);
});

it("treats nothing as new on the first run, then remembers what it showed", () => {
  render(<MapScreen />);
  expect(mocks.frame).toBeUndefined();
  expect(mocks.writeKnown).toHaveBeenLastCalledWith(["A", "B"]);
});

it("lets a shared city from the spots screen win over a new save", () => {
  mocks.known = new Set(["A"]);
  mocks.params = { city: "lisbon", save: "save-1" };
  render(<MapScreen />);
  expect(mocks.frame?.key).toBe("save-1");
});

it("stops looking for a new save once the person touches the map", () => {
  mocks.known = new Set(["A", "B"]);
  const { rerender } = render(<MapScreen />);
  act(() => mocks.closeTouch?.());
  mocks.places = [
    place("C", "Faro", 37),
    place("A", "Lisbon", 38.7),
    place("B", "Porto", 41.1),
  ];
  rerender(<MapScreen />);
  expect(mocks.frame).toBeUndefined();
});

it("stops looking for a new save once the person uses a map control", () => {
  mocks.known = new Set(["A", "B"]);
  const { rerender } = render(<MapScreen />);
  act(() => mocks.went?.("want"));
  mocks.places = [
    place("C", "Faro", 37),
    place("A", "Lisbon", 38.7),
    place("B", "Porto", 41.1),
  ];
  rerender(<MapScreen />);
  expect(mocks.frame).toBeUndefined();
});

it("hands the map the busiest-city opening when it has places and nothing remembered", () => {
  render(<MapScreen />);
  expect(mocks.opening?.kind).toBe("fit");
});

it("clears the went switch so a shared city's places show", () => {
  const { rerender } = render(<MapScreen />);
  act(() => mocks.went?.("went"));
  expect(mocks.pins.some((pin) => pin.id.startsWith("B:"))).toBe(false);
  mocks.params = { city: "porto", save: "save-1" };
  rerender(<MapScreen />);
  expect(mocks.pins.some((pin) => pin.id.startsWith("B:"))).toBe(true);
});

it.each([
  ["denied", 0],
  ["granted", 1],
])(
  "keeps the no-places card once the map reports its area, with location %s",
  (location, buttons) => {
    mocks.params = {};
    mocks.places = [];
    mocks.location = location;
    render(<MapScreen />);
    expect(screen.getByTestId("empty")).toBeTruthy();
    act(() => mocks.area?.({ south: 1, north: 2, west: 3, east: 4 }));
    expect(screen.getByTestId("empty")).toBeTruthy();
    expect(screen.queryAllByTestId("locate")).toHaveLength(buttons);
  },
);

it("drops the no-places card but keeps the shared lists when the area in view has Discover places", () => {
  mocks.params = {};
  mocks.places = [];
  mocks.discover.beside = [{ ...place("C", "Paris", 48.8), _id: "c" }];
  render(<MapScreen />);
  expect(screen.queryByTestId("empty")).toBeNull();
  expect(screen.getByTestId("lists-only")).toBeTruthy();
});

it("keeps the shared lists when Discover places fill the area and the kind chips show", () => {
  mocks.params = {};
  mocks.places = [];
  mocks.discover.beside = ["a", "b", "c"].map((id) => ({
    ...place(id, "Lisbon", 38.7),
    _id: id,
    kinds: ["coffee"],
  }));
  render(<MapScreen />);
  expect(mocks.chips).toBeDefined();
  expect(screen.queryByTestId("empty")).toBeNull();
  expect(screen.getByTestId("lists-only")).toBeTruthy();
});

it("hides the shared lists while Search is open so they never cover the results or the keyboard", () => {
  mocks.params = {};
  mocks.places = [];
  mocks.discover.beside = [{ ...place("C", "Paris", 48.8), _id: "c" }];
  render(<MapScreen />);
  expect(screen.getByTestId("lists-only")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("search"));
  expect(screen.queryByTestId("lists-only")).toBeNull();
});

it("frames Discover places above the shared-list cards instead of under them", () => {
  mocks.params = {};
  mocks.places = [];
  mocks.discover.beside = [{ ...place("C", "Paris", 48.8), _id: "c" }];
  render(<MapScreen />);
  expect(screen.getByTestId("lists-only")).toBeTruthy();
  expect(mocks.viewport?.bottomInset).toBe(80 + 800 + 50 + 8);
});
