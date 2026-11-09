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
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useFocusEffect: (cb: () => void) => void cb,
}));
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
    }) => {
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
  MapFilterChips: vi.fn(() => null),
}));
vi.mock("@/components/map/map-round-button", () => ({
  MapRoundButton: vi.fn(() => null),
}));
vi.mock("@/components/empty-state", () => ({ EmptyState: vi.fn(() => null) }));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => null),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFillObject: {} },
  useUnistyles: () => ({
    theme: { gap: (n: number) => n * 8 },
    rt: { insets: { top: 0 } },
  }),
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() },
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

beforeEach(() => mocks.setCity.mockClear());

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
