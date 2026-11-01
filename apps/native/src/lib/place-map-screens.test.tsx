// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode, Ref } from "react";
import { useEffect, useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CityScreen from "@/app/(app)/city/[name]";
import SharedListScreen from "@/app/(app)/shared-list/[id]";

type Snaps = { expanded: number; middle: number; collapsed: number };

const mocks = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  queries: {} as Record<string, unknown>,
  isError: false,
  focused: true,
  stranded: false,
  push: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  selection: vi.fn(),
  moveSheet: vi.fn(),
  scrollToIndex: vi.fn(),
  sheetTop: 0,
  sheetSet: vi.fn(),
  snaps: undefined as Snaps | undefined,
  cardAvailable: true,
  openPlaceDetails: vi.fn(),
  cancelPlaceDetails: vi.fn(),
  openUrl: vi.fn(),
  alert: vi.fn(),
  backOrHome: vi.fn(),
  start: vi.fn(),
  listPlan: vi.fn(),
  remove: vi.fn(),
  markSeen: vi.fn(),
  setVisited: vi.fn(),
  removeListPlace: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/haptics", () => ({ haptics: { selection: mocks.selection } }));
vi.mock("@/lib/screen-dismiss", () => ({ backOrHome: mocks.backOrHome }));
vi.mock("@/lib/apple-place-card", () => ({
  canOpenPlaceCard: (appleId?: string) =>
    appleId !== undefined && mocks.cardAvailable,
  openPlaceDetails: mocks.openPlaceDetails,
  cancelPlaceDetails: mocks.cancelPlaceDetails,
}));
vi.mock("@/lib/city-plan", () => ({
  useCityPlan: () => ({ busy: null, start: mocks.start }),
}));
vi.mock("@/lib/place-removal", () => ({
  usePlaceRemoval: () => ({ busy: false, undo: null, remove: mocks.remove }),
}));
vi.mock("@/lib/share-link", () => ({ shareUrl: vi.fn() }));
vi.mock("@/lib/shared-lists", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/shared-lists")>()),
  useListPlan: () => mocks.listPlan,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (query: { name: string }) => ({
    data: mocks.queries[query.name],
    isError: mocks.isError,
  }),
}));
vi.mock("@convex-dev/react-query", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    convexQuery: (fn: never) => ({ name: getFunctionName(fn) }),
  };
});
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const byName: Record<string, unknown> = {
    "sharedLists:markSharedListSeen": mocks.markSeen,
    "sharedLists:setSharedListPlaceVisited": mocks.setVisited,
    "sharedLists:removeSharedListPlace": mocks.removeListPlace,
  };
  return {
    useMutation: (fn: never) => byName[getFunctionName(fn)] ?? vi.fn(),
    useConvexAuth: () => ({ isAuthenticated: true }),
  };
});
vi.mock("expo-router/react-navigation", () => ({
  useNavigationState: () => mocks.stranded,
}));
vi.mock("expo-router", () => {
  const Stack = {
    Screen: vi.fn(() => null),
    Toolbar: Object.assign(
      ({ children }: { children: ReactNode }) => <div>{children}</div>,
      {
        Button: vi.fn(
          ({
            children,
            onPress,
          }: {
            children: ReactNode;
            onPress: () => void;
          }) => <button onClick={onPress}>{children}</button>,
        ),
      },
    ),
  };
  return {
    Stack,
    useRouter: () => ({ push: mocks.push }),
    useLocalSearchParams: () => mocks.params,
    useFocusEffect: (effect: () => undefined | (() => void)) => {
      const focused = mocks.focused;
      useEffect(() => (focused ? effect() : undefined), [effect, focused]);
    },
  };
});
vi.mock("@/components/city/city-map", () => ({
  CityMap: vi.fn(
    ({
      pins,
      selected,
      onSelect,
    }: {
      pins: { number: number; name: string }[];
      selected: string | null;
      onSelect: (id: string) => void;
    }) => (
      <div data-testid="map" data-selected={selected ?? ""}>
        {pins.map((pin, index) => (
          <button
            key={pin.name}
            data-testid={`pin-${index}`}
            onClick={() =>
              onSelect(
                (document.querySelector(`[data-row="${index}"]`) as HTMLElement)
                  .dataset.id as string,
              )
            }
          >
            {pin.name}
          </button>
        ))}
      </div>
    ),
  ),
}));
vi.mock("@/components/city/city-sheet", () => ({
  moveSheet: mocks.moveSheet,
  CitySheet: vi.fn(
    ({
      snaps,
      header,
      list,
    }: {
      snaps: Snaps;
      header: ReactNode;
      list: (scroll: object) => ReactNode;
    }) => {
      mocks.snaps = snaps;
      return (
        <div>
          {header}
          {list({ scrollEnabled: true, bounces: false })}
        </div>
      );
    },
  ),
}));
vi.mock("@/components/city/plan-button", () => ({
  PlanButton: vi.fn(
    ({ kind, onPress }: { kind: string; onPress: () => void }) => (
      <button onClick={onPress}>{`plan ${kind}`}</button>
    ),
  ),
}));
vi.mock("@/components/city/place-removal", () => ({
  PlaceRemovalUndo: vi.fn(() => <span>undo bar</span>),
}));
function rowFake({
  name,
  number,
  selected,
  onPress,
  onPlaceDetails,
  onRemove,
  onVisited,
}: {
  name: string;
  number?: number;
  selected?: boolean;
  onPress: () => void;
  onPlaceDetails?: () => void;
  onRemove?: () => void;
  onVisited?: (visited: boolean) => void;
}) {
  return (
    <div>
      <button data-selected={selected ? "yes" : "no"} onClick={onPress}>
        {`${number ?? "-"} ${name}`}
      </button>
      {onPlaceDetails ? (
        <button onClick={onPlaceDetails}>{`info ${name}`}</button>
      ) : null}
      {onRemove ? <button onClick={onRemove}>{`remove ${name}`}</button> : null}
      {onVisited ? (
        <button onClick={() => onVisited(true)}>{`went ${name}`}</button>
      ) : null}
    </div>
  );
}
vi.mock("@/components/city/save-row", () => ({
  SaveRow: vi.fn(
    ({
      item,
      placeName,
      ...rest
    }: {
      item: { title?: string };
      placeName?: string;
      onPress: () => void;
    }) => rowFake({ name: placeName ?? item.title ?? "", ...rest }),
  ),
}));
vi.mock("@/components/shared-list/list-place-row", () => ({
  ListPlaceRow: vi.fn(
    ({ place, ...rest }: { place: { name: string }; onPress: () => void }) =>
      rowFake({ name: place.name, ...rest }),
  ),
}));
vi.mock("@/components/shared-list/list-footer", () => ({
  ListFooter: vi.fn(({ city }: { city: string }) => (
    <span>{`footer ${city}`}</span>
  )),
}));
vi.mock("@/components/shared-list/list-header-right", () => ({
  ListHeaderRight: vi.fn(() => <span>header right</span>),
}));
vi.mock("@/components/trip-planner/chip", () => ({
  Chip: vi.fn(({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{`chip ${label}`}</button>
  )),
}));
vi.mock("@/components/empty-state", () => ({
  EmptyState: vi.fn(
    ({ title, message }: { title: string; message: string }) => (
      <div>
        <span>{title}</span>
        <span>{message}</span>
      </div>
    ),
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({ title, onPress }: { title: string; onPress: () => void }) => (
      <button onClick={onPress}>{title}</button>
    ),
  ),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <span>loader</span>),
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(() => null),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    FlatList: vi.fn(
      ({
        ref,
        data,
        keyExtractor,
        renderItem,
        ListEmptyComponent: empty,
        ListFooterComponent: footer,
      }: {
        ref: Ref<unknown>;
        data: { id: string }[];
        keyExtractor: (row: { id: string }) => string;
        renderItem: (info: { item: unknown }) => ReactNode;
        ListEmptyComponent: ReactNode;
        ListFooterComponent?: ReactNode;
      }) => {
        useImperativeHandle(ref, () => ({
          scrollToIndex: mocks.scrollToIndex,
        }));
        return (
          <div>
            {data.map((item, index) => (
              <div key={keyExtractor(item)} data-row={index} data-id={item.id}>
                {renderItem({ item })}
              </div>
            ))}
            {data.length === 0 ? empty : null}
            {footer}
          </div>
        );
      },
    ),
  },
  useSharedValue: (initial: number) => ({
    get: () => mocks.sheetTop || initial,
    set: mocks.sheetSet,
  }),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
    hairlineWidth: 1,
    absoluteFillObject: {},
  },
  useUnistyles: () => ({
    rt: { screen: { height: 800 }, insets: { top: 50, bottom: 30 } },
    theme: {
      gap: (n: number) => n * 8,
      colors: { foreground: "f", primary: "p", onTint: "o" },
    },
  }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  FlatList: vi.fn(() => null),
  Linking: { openURL: mocks.openUrl },
  Platform: { OS: "ios", select: () => undefined },
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Share: { sharedAction: "sharedAction" },
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
}));

const CITY_ITEMS = "items:listCityItems";
const LIST = "sharedLists:getSharedList";

const taco = {
  name: "Taco Spot",
  lat: 30.1,
  lng: -97.1,
  city: "Austin",
  appleId: "taco",
};
const bbq = { name: "BBQ Pit", lat: 30.2, lng: -97.2, city: "Austin" };
const save = {
  _id: "item-1",
  title: "Austin reel",
  cities: ["Austin"],
  placePins: [taco, bbq],
};
const unplaced = { _id: "item-2", title: "No places", cities: ["Austin"] };

function listPlace(overrides: object) {
  return {
    _id: "p1",
    name: "Taco Spot",
    lat: 30.1,
    lng: -97.1,
    city: "Austin",
    addedByName: "Sam",
    addedByYou: false,
    isNew: false,
    ...overrides,
  };
}
function listDetail(overrides: object = {}) {
  const places = [
    listPlace({}),
    listPlace({ _id: "p2", name: "BBQ Pit", lat: 30.2, lng: -97.2 }),
  ];
  return {
    _id: "list-1",
    name: "Date spots",
    cities: ["Austin"],
    placeCount: places.length,
    places,
    members: [
      { firstName: "Ash", isYou: true },
      { firstName: "Sam", isYou: false },
    ],
    covered: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = {};
  mocks.queries = {};
  mocks.isError = false;
  mocks.focused = true;
  mocks.stranded = false;
  mocks.sheetTop = 0;
  mocks.snaps = undefined;
  mocks.cardAvailable = true;
  mocks.markSeen.mockResolvedValue(null);
  mocks.setVisited.mockResolvedValue(null);
  mocks.removeListPlace.mockResolvedValue(null);
  mocks.openUrl.mockResolvedValue(true);
});

describe("city page", () => {
  beforeEach(() => {
    mocks.params = { name: "Austin" };
  });

  it("shows a loader, then an error, without the sheet", () => {
    const { rerender } = render(<CityScreen />);
    expect(screen.getByText("loader")).toBeTruthy();
    mocks.isError = true;
    rerender(<CityScreen />);
    expect(screen.getByText("errors.unexpectedTitle")).toBeTruthy();
    expect(screen.getByText("errors.retrySoon")).toBeTruthy();
  });

  it("reports the open once, with the save count", () => {
    mocks.queries[CITY_ITEMS] = [save, unplaced];
    const { rerender } = render(<CityScreen />);
    rerender(<CityScreen />);
    expect(mocks.capture.mock.calls).toEqual([["city_opened", { count: 2 }]]);
  });

  it("names the city, counts its places and plans from either button", () => {
    mocks.queries[CITY_ITEMS] = [save, unplaced];
    render(<CityScreen />);
    expect(screen.getByText("Austin")).toBeTruthy();
    expect(
      screen.getByText('cityMap.placesFromSaves {"count":2}'),
    ).toBeTruthy();
    expect(screen.getByTestId("map")).toBeTruthy();
    expect(screen.getByText("undo bar")).toBeTruthy();
    fireEvent.click(screen.getByText("plan date"));
    fireEvent.click(screen.getByText("plan trip"));
    expect(mocks.start.mock.calls).toEqual([
      ["date", "Austin"],
      ["trip", "Austin"],
    ]);
  });

  it("with no saves shows its empty copy and no map or plans", () => {
    mocks.queries[CITY_ITEMS] = [];
    render(<CityScreen />);
    expect(screen.getByText("cityMap.noPlacesLeft")).toBeTruthy();
    expect(
      screen.getByText('cityMap.noPlacesLeftBody {"city":"Austin"}'),
    ).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByText("plan date")).toBeNull();
  });

  it("keeps the list open and undraggable without a map", () => {
    mocks.queries[CITY_ITEMS] = [unplaced];
    render(<CityScreen />);
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByText(/cityMap.placesFromSaves/)).toBeNull();
    expect(screen.getByText("plan date")).toBeTruthy();
    const snaps = mocks.snaps as Snaps;
    expect(snaps.middle).toBe(snaps.expanded);
    expect(snaps.collapsed).toBe(snaps.expanded);
  });

  it("rests at the middle with a map", () => {
    mocks.queries[CITY_ITEMS] = [save];
    render(<CityScreen />);
    const snaps = mocks.snaps as Snaps;
    expect(snaps.middle).toBeGreaterThan(snaps.expanded);
  });

  it("keeps the map after its last pin is removed", () => {
    mocks.queries[CITY_ITEMS] = [save];
    const { rerender } = render(<CityScreen />);
    mocks.queries[CITY_ITEMS] = [unplaced];
    rerender(<CityScreen />);
    expect(screen.getByTestId("map")).toBeTruthy();
  });

  it("selects with a tick, then a second tap opens the save", () => {
    mocks.queries[CITY_ITEMS] = [save];
    render(<CityScreen />);
    fireEvent.click(screen.getByText("1 Taco Spot"));
    expect(mocks.selection).toHaveBeenCalledTimes(1);
    expect(mocks.scrollToIndex).toHaveBeenCalledWith({
      index: 0,
      viewPosition: 0.3,
    });
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("1 Taco Spot"));
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/item/[id]",
      params: { id: "item-1" },
    });
    expect(mocks.selection).toHaveBeenCalledTimes(1);
  });

  it("gives no second tick when a selected pin is tapped again", () => {
    mocks.queries[CITY_ITEMS] = [save];
    render(<CityScreen />);
    fireEvent.click(screen.getByTestId("pin-0"));
    fireEvent.click(screen.getByTestId("pin-0"));
    expect(mocks.selection).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("map").dataset.selected).toBeTruthy();
  });

  it("brings the sheet back only when it is pulled below the middle", () => {
    mocks.queries[CITY_ITEMS] = [save];
    render(<CityScreen />);
    const snaps = mocks.snaps as Snaps;
    fireEvent.click(screen.getByTestId("pin-0"));
    expect(mocks.moveSheet).not.toHaveBeenCalled();
    mocks.sheetTop = snaps.middle + 10;
    fireEvent.click(screen.getByTestId("pin-1"));
    expect(mocks.moveSheet).toHaveBeenCalledTimes(1);
    expect(mocks.moveSheet.mock.calls[0]?.[1]).toBe(snaps.middle);
  });

  it("opens a row with no place straight to its save", () => {
    mocks.queries[CITY_ITEMS] = [unplaced];
    render(<CityScreen />);
    fireEvent.click(screen.getByText("- No places"));
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/item/[id]",
      params: { id: "item-2" },
    });
    expect(screen.queryByText("remove No places")).toBeNull();
  });

  it("offers Apple's card only with an id, falling back to the save", () => {
    mocks.queries[CITY_ITEMS] = [save];
    render(<CityScreen />);
    expect(screen.queryByText("info BBQ Pit")).toBeNull();
    fireEvent.click(screen.getByText("info Taco Spot"));
    expect(mocks.openPlaceDetails).toHaveBeenCalledWith(
      "taco",
      expect.any(Function),
    );
    (mocks.openPlaceDetails.mock.calls[0]?.[1] as () => void)();
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/item/[id]",
      params: { id: "item-1" },
    });
  });

  it("clears the selection when a place is removed", () => {
    mocks.queries[CITY_ITEMS] = [save];
    render(<CityScreen />);
    fireEvent.click(screen.getByText("1 Taco Spot"));
    fireEvent.click(screen.getByText("remove Taco Spot"));
    expect(screen.getByTestId("map").dataset.selected).toBe("");
    expect(mocks.remove).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ name: "Taco Spot" }),
    );
  });

  it("does not open a save after leaving, and cancels a pending card", () => {
    mocks.queries[CITY_ITEMS] = [unplaced];
    const { rerender } = render(<CityScreen />);
    mocks.focused = false;
    rerender(<CityScreen />);
    expect(mocks.cancelPlaceDetails).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("- No places"));
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("list page", () => {
  beforeEach(() => {
    mocks.params = { id: "list-1" };
  });

  it("shows a loader, an error, or that the list is gone", () => {
    const { rerender } = render(<SharedListScreen />);
    expect(screen.getByText("loader")).toBeTruthy();
    mocks.queries[LIST] = null;
    rerender(<SharedListScreen />);
    expect(screen.getByText("sharedLists.goneTitle")).toBeTruthy();
    expect(screen.getByText("sharedLists.goneBody")).toBeTruthy();
    fireEvent.click(screen.getByText("sharedLists.backHome"));
    expect(mocks.backOrHome).toHaveBeenCalledTimes(1);
    mocks.isError = true;
    rerender(<SharedListScreen />);
    expect(screen.getByText("errors.unexpectedTitle")).toBeTruthy();
  });

  it("gives a stranded screen its own Back", () => {
    mocks.stranded = true;
    render(<SharedListScreen />);
    fireEvent.click(screen.getByText("common.back"));
    expect(mocks.backOrHome).toHaveBeenCalledTimes(1);
  });

  it("reports the open once, with its counts", () => {
    mocks.queries[LIST] = listDetail({
      places: [listPlace({ isNew: true })],
      placeCount: 1,
    });
    const { rerender } = render(<SharedListScreen />);
    rerender(<SharedListScreen />);
    expect(mocks.capture.mock.calls).toEqual([
      ["shared_list_opened", { places: 1, members: 2, fresh: 1 }],
    ]);
  });

  it("marks the list seen on leaving, only once it has loaded", () => {
    const { rerender } = render(<SharedListScreen />);
    mocks.focused = false;
    rerender(<SharedListScreen />);
    expect(mocks.markSeen).not.toHaveBeenCalled();
    mocks.focused = true;
    mocks.queries[LIST] = listDetail();
    rerender(<SharedListScreen />);
    mocks.focused = false;
    rerender(<SharedListScreen />);
    expect(mocks.markSeen).toHaveBeenCalledWith({ listId: "list-1" });
    expect(mocks.cancelPlaceDetails).toHaveBeenCalled();
  });

  it("shows its name, count, cities and members, and its header actions", () => {
    mocks.queries[LIST] = listDetail();
    render(<SharedListScreen />);
    expect(screen.getByText("Date spots")).toBeTruthy();
    expect(screen.getByText('homePlaces.spotCount {"count":2}')).toBeTruthy();
    expect(screen.getByText(/^Austin · /)).toBeTruthy();
    expect(screen.getByText("header right")).toBeTruthy();
    expect(screen.getByText("footer Austin")).toBeTruthy();
    expect(screen.queryByText("undo bar")).toBeNull();
  });

  it("shows city chips for several cities, and a chip clears the selection", () => {
    mocks.queries[LIST] = listDetail({
      cities: ["Austin", "Dallas"],
      places: [
        listPlace({}),
        listPlace({
          _id: "p2",
          name: "Dallas Deli",
          city: "Dallas",
          lat: 32.7,
          lng: -96.8,
        }),
      ],
    });
    render(<SharedListScreen />);
    expect(screen.queryByText(/Dallas Deli$/)).toBeNull();
    fireEvent.click(screen.getByText("1 Taco Spot"));
    expect(screen.getByTestId("map").dataset.selected).toBeTruthy();
    fireEvent.click(screen.getByText("chip Dallas"));
    expect(screen.getByText("1 Dallas Deli")).toBeTruthy();
    expect(screen.queryByText("1 Taco Spot")).toBeNull();
    expect(screen.getByTestId("map").dataset.selected).toBe("");
    expect(screen.getByText("footer Dallas")).toBeTruthy();
  });

  it("has no chips for one city", () => {
    mocks.queries[LIST] = listDetail();
    render(<SharedListScreen />);
    expect(screen.queryByText("chip Austin")).toBeNull();
  });

  it("with no places shows its empty copy and no map or plans", () => {
    mocks.queries[LIST] = listDetail({ places: [], placeCount: 0 });
    render(<SharedListScreen />);
    expect(screen.getByText("sharedLists.emptyTitle")).toBeTruthy();
    expect(screen.getByText("sharedLists.emptyBody")).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByText("plan date")).toBeNull();
    const snaps = mocks.snaps as Snaps;
    expect(snaps.middle).toBe(snaps.expanded);
    expect(snaps.collapsed).toBe(snaps.expanded);
  });

  it("drops the map once the last place goes", () => {
    mocks.queries[LIST] = listDetail();
    const { rerender } = render(<SharedListScreen />);
    expect(screen.getByTestId("map")).toBeTruthy();
    mocks.queries[LIST] = listDetail({ places: [], placeCount: 0 });
    rerender(<SharedListScreen />);
    expect(screen.queryByTestId("map")).toBeNull();
  });

  it("plans a date always, and a trip only with somewhere unvisited", () => {
    mocks.queries[LIST] = listDetail();
    const { rerender } = render(<SharedListScreen />);
    fireEvent.click(screen.getByText("plan date"));
    fireEvent.click(screen.getByText("plan trip"));
    expect(mocks.listPlan.mock.calls).toEqual([["date"], ["trip"]]);
    mocks.queries[LIST] = listDetail({
      places: [listPlace({ visitedAt: 1 })],
      placeCount: 1,
    });
    rerender(<SharedListScreen />);
    expect(screen.getByText("plan date")).toBeTruthy();
    expect(screen.queryByText("plan trip")).toBeNull();
  });

  it("selects without a tick and scrolls to the row", () => {
    mocks.queries[LIST] = listDetail();
    render(<SharedListScreen />);
    fireEvent.click(screen.getByTestId("pin-1"));
    expect(mocks.selection).not.toHaveBeenCalled();
    expect(mocks.scrollToIndex).toHaveBeenCalledWith({
      index: 1,
      viewPosition: 0.3,
    });
  });

  it("brings the sheet back only when it is pulled below the middle", () => {
    mocks.queries[LIST] = listDetail();
    render(<SharedListScreen />);
    const snaps = mocks.snaps as Snaps;
    fireEvent.click(screen.getByTestId("pin-0"));
    expect(mocks.moveSheet).not.toHaveBeenCalled();
    mocks.sheetTop = snaps.middle + 10;
    fireEvent.click(screen.getByTestId("pin-1"));
    expect(mocks.moveSheet.mock.calls[0]?.[1]).toBe(snaps.middle);
  });

  it("opens the save on a second tap when the row has one", () => {
    mocks.queries[LIST] = listDetail({
      places: [listPlace({ itemId: "item-9", appleId: "taco" })],
      placeCount: 1,
    });
    render(<SharedListScreen />);
    fireEvent.click(screen.getByText("1 Taco Spot"));
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("1 Taco Spot"));
    expect(mocks.push).toHaveBeenCalledWith({
      pathname: "/item/[id]",
      params: { id: "item-9" },
    });
    expect(mocks.capture).toHaveBeenCalledWith("shared_list_place_opened", {
      action: "save",
    });
  });

  it("opens Apple's card without a save, then Maps if there is no card", () => {
    mocks.queries[LIST] = listDetail({
      places: [listPlace({ appleId: "taco" })],
      placeCount: 1,
    });
    render(<SharedListScreen />);
    fireEvent.click(screen.getByText("info Taco Spot"));
    expect(mocks.capture).toHaveBeenCalledWith("shared_list_place_opened", {
      action: "card",
    });
    expect(mocks.openPlaceDetails).toHaveBeenCalledWith(
      "taco",
      expect.any(Function),
    );
    (mocks.openPlaceDetails.mock.calls[0]?.[1] as () => void)();
    expect(mocks.openUrl).toHaveBeenCalledWith(
      expect.stringContaining("maps.apple.com"),
    );
  });

  it("opens Maps directly with no card, and reports a failure", async () => {
    const failure = new Error("no");
    mocks.openUrl.mockRejectedValue(failure);
    mocks.queries[LIST] = listDetail();
    render(<SharedListScreen />);
    fireEvent.click(screen.getByText("1 Taco Spot"));
    await act(async () => {
      fireEvent.click(screen.getByText("1 Taco Spot"));
    });
    expect(mocks.capture).toHaveBeenCalledWith("shared_list_place_opened", {
      action: "maps",
    });
    expect(mocks.captureError).toHaveBeenCalledWith(
      "shared_list_maps_failed",
      failure,
    );
  });

  it("does nothing on a tap or a late card once the screen has left", () => {
    mocks.queries[LIST] = listDetail({
      places: [listPlace({ appleId: "taco" })],
      placeCount: 1,
    });
    const { rerender } = render(<SharedListScreen />);
    fireEvent.click(screen.getByText("info Taco Spot"));
    mocks.capture.mockClear();
    mocks.focused = false;
    rerender(<SharedListScreen />);
    (mocks.openPlaceDetails.mock.calls[0]?.[1] as () => void)();
    expect(mocks.openUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("info Taco Spot"));
    expect(mocks.openPlaceDetails).toHaveBeenCalledTimes(1);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("marks a place visited, and removing one clears the selection", async () => {
    mocks.queries[LIST] = listDetail();
    render(<SharedListScreen />);
    fireEvent.click(screen.getByText("1 Taco Spot"));
    await act(async () => {
      fireEvent.click(screen.getByText("went Taco Spot"));
    });
    expect(mocks.setVisited).toHaveBeenCalledWith({
      placeId: "p1",
      visited: true,
    });
    await act(async () => {
      fireEvent.click(screen.getByText("remove Taco Spot"));
    });
    expect(mocks.removeListPlace).toHaveBeenCalledWith({ placeId: "p1" });
    expect(screen.getByTestId("map").dataset.selected).toBe("");
  });

  it("alerts when an edit fails", async () => {
    const failure = new Error("no");
    mocks.setVisited.mockRejectedValue(failure);
    mocks.queries[LIST] = listDetail();
    render(<SharedListScreen />);
    await act(async () => {
      fireEvent.click(screen.getByText("went Taco Spot"));
    });
    expect(mocks.captureError).toHaveBeenCalledWith(
      "shared_list_edit_failed",
      failure,
    );
    expect(mocks.alert).toHaveBeenCalledWith("sharedLists.failed");
  });
});
