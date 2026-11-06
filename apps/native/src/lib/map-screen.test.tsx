// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapScreen from "@/app/(app)/(tabs)/(map)/index";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { BEEN_CITY_POINTS } from "@convex/model/beenCities";

type Pin = { id: string; lat: number; lng: number; been?: boolean };
type MapProps = {
  pins: Pin[];
  framed: { lat: number; lng: number }[];
  topInset: number;
};
type Result = { data: unknown; error: Error | null; isError: boolean };
type Layout = (event: { nativeEvent: { layout: { height: number } } }) => void;

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, Result>,
  location: "denied" as "asking" | "granted" | "denied",
  fontScale: 1,
  map: undefined as MapProps | undefined,
  layout: undefined as Layout | undefined,
  push: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/map-location", () => ({
  useMapLocation: () => mocks.location,
}));
vi.mock("@/lib/apple-place-card", () => ({
  canOpenPlaceCard: () => false,
  openPlaceDetails: vi.fn(),
  cancelPlaceDetails: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (query: { name: string }) =>
    mocks.queries[query.name] ?? {
      data: undefined,
      error: null,
      isError: false,
    },
}));
vi.mock("@convex-dev/react-query", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    convexQuery: (fn: never, args: unknown) => ({
      name: args === "skip" ? "skip" : getFunctionName(fn),
    }),
  };
});
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => vi.fn(),
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    useEffect(() => effect(), [effect]);
  },
}));
vi.mock("@/components/map/places-map", () => ({
  PlacesMap: vi.fn((props: MapProps) => {
    mocks.map = props;
    return null;
  }),
}));
vi.mock("@/components/map/map-search", () => ({
  MapSearch: vi.fn(
    ({
      text,
      onChangeText,
    }: {
      text: string;
      onChangeText: (text: string) => void;
    }) => (
      <input
        data-testid="map-search"
        value={text}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  ),
}));
vi.mock("@/components/map/map-filter-chips", () => ({
  MapFilterChips: vi.fn(
    ({
      kinds,
      onSelect,
    }: {
      kinds: string[];
      onSelect: (kind: string | null) => void;
    }) => (
      <div>
        <button onClick={() => onSelect(null)}>chip all</button>
        {kinds.map((kind) => (
          <button key={kind} onClick={() => onSelect(kind)}>
            {`chip ${kind}`}
          </button>
        ))}
      </div>
    ),
  ),
}));
vi.mock("@/components/empty-state", () => ({
  EmptyState: vi.fn(
    ({
      title,
      message,
      children,
    }: {
      title: string;
      message: string;
      children?: ReactNode;
    }) => (
      <div>
        <span>{title}</span>
        <span>{message}</span>
        {children}
      </div>
    ),
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({
      title,
      testID,
      onPress,
    }: {
      title: string;
      testID: string;
      onPress: () => void;
    }) => (
      <button data-testid={testID} onClick={onPress}>
        {title}
      </button>
    ),
  ),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <span>loader</span>),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({
    rt: { insets: { top: 50, bottom: 30 } },
    theme: {
      gap: (n: number) => n * 8,
      control: { minHeight: 48 },
      colors: { background: "#ffffff" },
    },
  }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Keyboard: { dismiss: vi.fn() },
  useWindowDimensions: () => ({ fontScale: mocks.fontScale }),
  Text: vi.fn(
    ({
      children,
      maxFontSizeMultiplier,
    }: {
      children?: ReactNode;
      maxFontSizeMultiplier?: number;
    }) => <span data-max-scale={maxFontSizeMultiplier}>{children}</span>,
  ),
  Pressable: vi.fn(
    ({
      children,
      testID,
      onPress,
    }: {
      children?: ReactNode;
      testID?: string;
      onPress: () => void;
    }) => (
      <button data-testid={testID} onClick={onPress}>
        {children}
      </button>
    ),
  ),
  View: vi.fn(
    ({
      children,
      style,
      onLayout,
    }: {
      children?: ReactNode;
      style?: { height?: number };
      onLayout?: Layout;
    }) => {
      if (onLayout) mocks.layout = onLayout;
      return <div data-height={style?.height}>{children}</div>;
    },
  ),
}));

const PLACES = "mapPlaces:listMapPlaces";
const BEEN = "beenCities:listBeenCities";
const TOP = 50 + 8;

const loaded = (data: unknown): Result => ({
  data,
  error: null,
  isError: false,
});
const taco = (n: number) => ({
  itemId: `item-${n}`,
  name: `Taco ${n}`,
  lat: BEEN_CITY_POINTS.austin.lat + n * 0.001,
  lng: BEEN_CITY_POINTS.austin.lng,
  city: "Austin",
  kinds: ["food"],
});
const AUSTIN_TACOS = [taco(1), taco(2), taco(3)];
const corners = (id: keyof typeof BEEN_CITY_POINTS) => [
  {
    lat: BEEN_CITY_POINTS[id].lat - 0.2,
    lng: BEEN_CITY_POINTS[id].lng - 0.2,
  },
  {
    lat: BEEN_CITY_POINTS[id].lat + 0.2,
    lng: BEEN_CITY_POINTS[id].lng + 0.2,
  },
];

function given(places: unknown[] | undefined, been: string[] | undefined) {
  mocks.queries = {
    [PLACES]: loaded(places),
    [BEEN]: loaded(been),
  };
}
const beenPins = () =>
  (mocks.map?.pins ?? []).filter((pin) => pin.been).map((pin) => pin.id);
const gradient = () =>
  Number(document.querySelector("[data-height]")?.getAttribute("data-height"));

beforeEach(() => {
  mocks.queries = {};
  mocks.location = "denied";
  mocks.fontScale = 1;
  mocks.map = undefined;
  mocks.layout = undefined;
  mocks.push.mockClear();
  mocks.capture.mockClear();
  mocks.captureError.mockClear();
});
afterEach(cleanup);

describe("the Map tab with no places", () => {
  it("offers the Been editor when there are no Been cities either", () => {
    given([], []);
    render(<MapScreen />);
    expect(screen.getByText("map.emptyTitle")).toBeTruthy();
    expect(mocks.map).toBeUndefined();
    fireEvent.click(screen.getByTestId("map-add-been"));
    expect(mocks.capture).toHaveBeenCalledWith("been_cities_editor_opened", {
      surface: "map",
      count: 0,
    });
    expect(mocks.push).toHaveBeenCalledWith("/been-cities");
  });

  it("draws the Been cities, framed, under a card in place of search", () => {
    given([], ["lisbon", "madrid"]);
    render(<MapScreen />);
    expect(mocks.map?.pins).toEqual([
      {
        id: "been:lisbon",
        name: "tripTeaser.cityLisbon",
        ...BEEN_CITY_POINTS.lisbon,
        been: true,
      },
      {
        id: "been:madrid",
        name: "tripTeaser.cityMadrid",
        ...BEEN_CITY_POINTS.madrid,
        been: true,
      },
    ]);
    expect(mocks.map?.framed).toEqual([
      ...corners("lisbon"),
      ...corners("madrid"),
    ]);
    expect(screen.getByText('been.mapTitle {"count":2}')).toBeTruthy();
    expect(screen.getByText("map.emptyBody")).toBeTruthy();
    expect(screen.queryByTestId("map-search")).toBeNull();
    fireEvent.click(screen.getByTestId("map-been-edit"));
    expect(mocks.capture).toHaveBeenCalledWith("been_cities_editor_opened", {
      surface: "map",
      count: 2,
    });
    expect(mocks.push).toHaveBeenCalledWith("/been-cities");
  });

  it("keeps room for the card, estimated by text size until it is measured", () => {
    given([], ["lisbon"]);
    mocks.fontScale = 2;
    const view = render(<MapScreen />);
    expect(mocks.map?.topInset).toBe(TOP + 240);
    expect(gradient()).toBe(TOP + 240 + 16);
    mocks.fontScale = 1;
    view.rerender(<MapScreen />);
    expect(mocks.map?.topInset).toBe(TOP + 120);
    expect(gradient()).toBe(TOP + 120 + 16);
    act(() => mocks.layout?.({ nativeEvent: { layout: { height: 131.2 } } }));
    expect(mocks.map?.topInset).toBe(TOP + 132);
    expect(gradient()).toBe(TOP + 132 + 16);
  });

  it("stops the card growing at twice the default text size, and the room kept for it", () => {
    given([], ["lisbon"]);
    mocks.fontScale = 3.5;
    render(<MapScreen />);
    expect(mocks.map?.topInset).toBe(TOP + 240);
    expect(gradient()).toBe(TOP + 240 + 16);
    for (const text of [
      'been.mapTitle {"count":1}',
      "been.edit",
      "map.emptyBody",
    ]) {
      expect(screen.getByText(text).getAttribute("data-max-scale")).toBe(
        String(HEADLINE_MAX_SCALE),
      );
    }
  });

  it("shows the Been cities even when search text was left from before", () => {
    given(AUSTIN_TACOS, ["lisbon"]);
    const view = render(<MapScreen />);
    fireEvent.change(screen.getByTestId("map-search"), {
      target: { value: "taco" },
    });
    expect(beenPins()).toEqual([]);
    given([], ["lisbon"]);
    view.rerender(<MapScreen />);
    expect(beenPins()).toEqual(["been:lisbon"]);
  });

  it("treats a failed Been query as none and reports it once", () => {
    const error = new Error("offline");
    mocks.queries = {
      [PLACES]: loaded([]),
      [BEEN]: { data: undefined, error, isError: true },
    };
    const view = render(<MapScreen />);
    view.rerender(<MapScreen />);
    expect(screen.getByTestId("map-add-been")).toBeTruthy();
    expect(mocks.captureError).toHaveBeenCalledTimes(1);
    expect(mocks.captureError).toHaveBeenCalledWith(
      "map_been_cities_failed",
      error,
    );
  });
});

describe("the Map tab with places", () => {
  it("adds a Been marker only where no place is near, and only on the full map", () => {
    given(AUSTIN_TACOS, ["austin", "lisbon"]);
    render(<MapScreen />);
    expect(beenPins()).toEqual(["been:lisbon"]);
    expect(mocks.map?.pins).toHaveLength(4);
    expect(mocks.map?.topInset).toBe(TOP + 48 + 8 + 48);
    expect(screen.getByTestId("map-search")).toBeTruthy();
    expect(screen.queryByTestId("map-been-edit")).toBeNull();
    fireEvent.click(screen.getByText("chip food"));
    expect(beenPins()).toEqual([]);
    fireEvent.click(screen.getByText("chip all"));
    expect(beenPins()).toEqual(["been:lisbon"]);
    fireEvent.change(screen.getByTestId("map-search"), {
      target: { value: "taco" },
    });
    expect(beenPins()).toEqual([]);
  });

  it("waits for the Been cities, then reports them in map_opened", () => {
    mocks.location = "granted";
    mocks.queries = { [PLACES]: loaded(AUSTIN_TACOS) };
    const view = render(<MapScreen />);
    expect(screen.getByText("loader")).toBeTruthy();
    expect(mocks.capture).not.toHaveBeenCalled();
    given(AUSTIN_TACOS, ["lisbon"]);
    view.rerender(<MapScreen />);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith("map_opened", {
      count: 3,
      located: true,
      been: 1,
    });
  });
});
