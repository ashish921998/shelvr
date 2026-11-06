// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddListPlaceScreen from "@/app/(app)/add-list-place";
import AddTripStopScreen from "@/app/(app)/add-trip-stop";

const mocks = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  queries: {} as Record<string, unknown>,
  mutations: {} as Record<string, (args: unknown) => Promise<unknown>>,
  search: { status: "idle" } as unknown,
  searchedFor: [] as string[],
  searchRun: undefined as ((text: string) => unknown) | undefined,
  searchAction: vi.fn(),
  gated: false,
  addStop: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  success: vi.fn(),
  backOrHome: vi.fn(),
  openPaywall: vi.fn(),
  alert: vi.fn(),
  title: undefined as string | undefined,
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/haptics", () => ({ haptics: { success: mocks.success } }));
vi.mock("@/lib/screen-dismiss", () => ({ backOrHome: mocks.backOrHome }));
vi.mock("@/lib/entitlement", () => ({ openPaywall: mocks.openPaywall }));
vi.mock("@/lib/plan-gate", () => ({
  usePlanGate: () => ({ gated: mocks.gated }),
}));
vi.mock("@/lib/shared-lists", () => ({
  inCity: (place: { city?: string }, city: string) => place.city === city,
}));
vi.mock("@/lib/trip-edit", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/trip-edit")>()),
  usePlaceSearch: (run: (text: string) => unknown, query: string) => {
    mocks.searchedFor.push(query);
    mocks.searchRun = run;
    return mocks.search;
  },
  useTripPlaceSearch: () => mocks.search,
  useAddTripStop: () => mocks.addStop,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (query: { name: string; args: unknown }) => ({
    data: query.args === "skip" ? undefined : mocks.queries[query.name],
    isError: false,
  }),
}));
vi.mock("@convex-dev/react-query", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    convexQuery: (fn: never, args: unknown) => ({
      name: getFunctionName(fn),
      args,
    }),
  };
});
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useMutation: (fn: never) => (args: unknown) =>
      mocks.mutations[getFunctionName(fn)]?.(args),
    useAction: () => mocks.searchAction,
  };
});
vi.mock("expo-router", () => {
  const Stack = {
    Screen: vi.fn(({ options }: { options: { title?: string } }) => {
      mocks.title = options.title;
      return null;
    }),
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
    Redirect: vi.fn(({ href }: { href: string }) => (
      <span>{`redirect ${href}`}</span>
    )),
    useRouter: () => ({}),
    useLocalSearchParams: () => mocks.params,
  };
});
vi.mock("@/components/symbol", () => ({
  AppSymbolIcon: vi.fn(({ name }: { name: string }) => <span>{name}</span>),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(() => null),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({ title, onPress }: { title: string; onPress: () => void }) => (
      <button onClick={onPress}>{title}</button>
    ),
  ),
}));
vi.mock("@/components/trip-planner/chip", () => ({
  Chip: vi.fn(
    ({
      label,
      selected,
      onPress,
    }: {
      label: string;
      selected: boolean;
      onPress: () => void;
    }) => (
      <button aria-pressed={selected} onClick={onPress}>
        {label}
      </button>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({
    theme: {
      colors: { muted: "m", foreground: "f", primary: "p", onTint: "o" },
      type: { title: {} },
    },
  }),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: vi.fn(() => <span>spinner</span>),
  Alert: { alert: mocks.alert },
  Platform: { OS: "ios" },
  Pressable: vi.fn(
    ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) => (
      <button
        aria-label={accessibilityLabel}
        disabled={disabled}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  TextInput: vi.fn(
    ({
      testID,
      value,
      onChangeText,
      placeholder,
      accessibilityLabel,
    }: {
      testID: string;
      value: string;
      onChangeText: (text: string) => void;
      placeholder: string;
      accessibilityLabel: string;
    }) => (
      <input
        data-testid={testID}
        value={value}
        placeholder={placeholder}
        aria-label={accessibilityLabel}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  ),
  View: vi.fn(
    ({
      children,
      accessibilityLabel,
    }: {
      children: ReactNode;
      accessibilityLabel?: string;
    }) => <div aria-label={accessibilityLabel}>{children}</div>,
  ),
}));

const found = { name: "Veracruz", lat: 30.1, lng: -97.1, area: "East Austin" };
const already = { name: "Odd Duck", lat: 30.2, lng: -97.2, appleId: "duck" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = {};
  mocks.queries = {};
  mocks.mutations = {};
  mocks.search = { status: "idle" };
  mocks.searchedFor = [];
  mocks.searchRun = undefined;
  mocks.gated = false;
  mocks.title = undefined;
});

const LIST = "sharedLists:getSharedList";
const MAP_PLACES = "mapPlaces:listMapPlaces";
const TRIP = "tripPlannerData:getTripPlan";
const TRIP_SAVES = "tripPlannerData:tripSavePlaces";
const ADD_FOUND = "sharedLists:addSharedListPlace";
const ADD_SAVE = "sharedLists:addSavePlaces";

function type(testId: string, text: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value: text } });
}

describe("Add a place on a list", () => {
  const detail = {
    covered: true,
    cities: ["Austin", "Dallas"],
    places: [already],
  };

  beforeEach(() => {
    mocks.params = { listId: "list-1", city: "Austin" };
  });

  it("shows only the title and Close while the list loads", () => {
    render(<AddListPlaceScreen />);
    expect(mocks.title).toBe("tripPlanner.addPlace");
    expect(screen.queryByTestId("add-list-place-search")).toBeNull();
    fireEvent.click(screen.getByText("common.close"));
    expect(mocks.backOrHome).toHaveBeenCalledTimes(1);
  });

  it("offers plans instead of search when the list is not covered", () => {
    mocks.queries[LIST] = { ...detail, covered: false };
    render(<AddListPlaceScreen />);
    expect(screen.getByText("sharedLists.notCoveredTitle")).toBeTruthy();
    expect(screen.getByText("sharedLists.notCoveredBody")).toBeTruthy();
    expect(screen.queryByTestId("add-list-place-search")).toBeNull();
    expect(mocks.searchedFor.at(-1)).toBe("");
    fireEvent.click(screen.getByText("planGate.seePlans"));
    expect(mocks.openPaywall).toHaveBeenCalledWith({}, "shared_list_search");
  });

  it("searches the list's city for what was typed", () => {
    mocks.queries[LIST] = detail;
    render(<AddListPlaceScreen />);
    type("add-list-place-search", "taco");
    expect(mocks.searchedFor.at(-1)).toBe("taco");
    void mocks.searchRun?.("taco");
    expect(mocks.searchAction).toHaveBeenCalledWith({
      listId: "list-1",
      city: "Austin",
      query: "taco",
      locale: "en",
    });
  });

  it("stops searching what was typed once the list is not covered", () => {
    mocks.queries[LIST] = detail;
    const { rerender } = render(<AddListPlaceScreen />);
    type("add-list-place-search", "taco");
    expect(mocks.searchedFor.at(-1)).toBe("taco");
    mocks.queries[LIST] = { ...detail, covered: false };
    rerender(<AddListPlaceScreen />);
    expect(mocks.searchedFor.at(-1)).toBe("");
  });

  it("does not search without a city", () => {
    mocks.params = { listId: "list-1" };
    mocks.queries[LIST] = { ...detail, cities: [] };
    render(<AddListPlaceScreen />);
    type("add-list-place-search", "taco");
    expect(mocks.searchedFor.at(-1)).toBe("");
  });

  it("names the city in the search field and offers no day picker", () => {
    mocks.queries[LIST] = detail;
    render(<AddListPlaceScreen />);
    const placeholder = 'tripPlanner.searchPlaceholder {"city":"Austin"}';
    const input = screen.getByTestId("add-list-place-search");
    expect(input.getAttribute("placeholder")).toBe(placeholder);
    expect(input.getAttribute("aria-label")).toBe(placeholder);
    expect(screen.queryByText("tripPlanner.addTo")).toBeNull();
  });

  it("falls back to the list's first city", () => {
    mocks.params = { listId: "list-1" };
    mocks.queries[LIST] = detail;
    render(<AddListPlaceScreen />);
    expect(
      screen.getByTestId("add-list-place-search").getAttribute("placeholder"),
    ).toBe('tripPlanner.searchPlaceholder {"city":"Austin"}');
  });

  it("marks a result already on the list and leaves the others addable", () => {
    mocks.queries[LIST] = detail;
    mocks.search = { status: "done", places: [found, already] };
    render(<AddListPlaceScreen />);
    expect(screen.queryByText("tripPlanner.onAppleMaps")).toBeNull();
    type("add-list-place-search", "taco");
    expect(screen.getByText("tripPlanner.onAppleMaps")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Veracruz, East Austin" }),
    ).toBeTruthy();
    expect(screen.getByText("plus.circle.fill")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Odd Duck, sharedLists.onList" }),
    ).toBeTruthy();
    expect(screen.getByText("sharedLists.onList")).toBeTruthy();
  });

  it.each([
    ["unavailable", "tripPlanner.searchUnavailable"],
    ["failed", "tripPlanner.searchUnavailable"],
  ])("says so when search is %s", (status, copy) => {
    mocks.queries[LIST] = detail;
    mocks.search = { status };
    render(<AddListPlaceScreen />);
    type("add-list-place-search", "taco");
    expect(screen.getByText(copy)).toBeTruthy();
  });

  it("says when search found nothing, and spins while searching", () => {
    mocks.queries[LIST] = detail;
    mocks.search = { status: "done", places: [] };
    const { rerender } = render(<AddListPlaceScreen />);
    type("add-list-place-search", "taco");
    expect(screen.getByText("tripPlanner.searchEmpty")).toBeTruthy();
    mocks.search = { status: "searching" };
    rerender(<AddListPlaceScreen />);
    expect(screen.getByLabelText("tripPlanner.searching")).toBeTruthy();
  });

  it("adds a found place with the list's city and closes", async () => {
    mocks.queries[LIST] = detail;
    mocks.search = { status: "done", places: [found] };
    const addFound = vi.fn(async () => "id");
    mocks.mutations[ADD_FOUND] = addFound;
    render(<AddListPlaceScreen />);
    type("add-list-place-search", "taco");
    fireEvent.click(
      screen.getByRole("button", { name: "Veracruz, East Austin" }),
    );
    await waitFor(() => expect(mocks.backOrHome).toHaveBeenCalledTimes(1));
    expect(addFound).toHaveBeenCalledWith({
      listId: "list-1",
      place: { ...found, city: "Austin" },
    });
    expect(mocks.capture).toHaveBeenCalledWith("shared_list_place_added", {
      from: "search",
    });
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it("shows saves in the list's cities not on it yet, and adds one", async () => {
    mocks.queries[LIST] = detail;
    mocks.queries[MAP_PLACES] = [
      { itemId: "i1", name: "Franklin", city: "Dallas" },
      { itemId: "i2", name: "Elsewhere", city: "Lima" },
      { itemId: "i3", ...already, city: "Austin" },
    ];
    const addSave = vi.fn(async () => "id");
    mocks.mutations[ADD_SAVE] = addSave;
    render(<AddListPlaceScreen />);
    expect(screen.getByText("tripPlanner.fromSaves")).toBeTruthy();
    expect(screen.queryByText("Elsewhere")).toBeNull();
    expect(screen.queryByText("Odd Duck")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Franklin, Dallas" }));
    await waitFor(() => expect(mocks.backOrHome).toHaveBeenCalledTimes(1));
    expect(addSave).toHaveBeenCalledWith({
      listId: "list-1",
      itemId: "i1",
      name: "Franklin",
      city: "Dallas",
    });
    expect(mocks.capture).toHaveBeenCalledWith("shared_list_place_added", {
      from: "save",
    });
  });

  it("narrows saves as you type and hides the section when none match", () => {
    mocks.queries[LIST] = detail;
    mocks.queries[MAP_PLACES] = [
      { itemId: "i1", name: "Franklin", city: "Austin" },
    ];
    render(<AddListPlaceScreen />);
    type("add-list-place-search", "zzz");
    expect(screen.queryByText("tripPlanner.fromSaves")).toBeNull();
    expect(screen.queryByText("tripPlanner.noSavesLeft")).toBeNull();
  });

  it("stays open with an alert when adding fails", async () => {
    mocks.queries[LIST] = detail;
    mocks.search = { status: "done", places: [found] };
    const failure = new Error("no");
    mocks.mutations[ADD_FOUND] = async () => {
      throw failure;
    };
    render(<AddListPlaceScreen />);
    type("add-list-place-search", "taco");
    fireEvent.click(
      screen.getByRole("button", { name: "Veracruz, East Austin" }),
    );
    await waitFor(() =>
      expect(mocks.alert).toHaveBeenCalledWith("tripPlanner.addFailed"),
    );
    expect(mocks.captureError).toHaveBeenCalledWith(
      "shared_list_add_failed",
      failure,
    );
    expect(mocks.backOrHome).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});

describe("Add a place on a trip", () => {
  const trip = {
    city: "Austin",
    dayCount: 2,
    days: [[already], []],
    unplanned: [],
  };

  beforeEach(() => {
    mocks.params = { tripId: "trip-1", day: "2" };
    mocks.addStop.mockResolvedValue(true);
  });

  it("shows only the title and Close while the trip loads", () => {
    render(<AddTripStopScreen />);
    expect(mocks.title).toBe("tripPlanner.addPlace");
    expect(screen.queryByTestId("add-trip-stop-search")).toBeNull();
    fireEvent.click(screen.getByText("common.close"));
    expect(mocks.backOrHome).toHaveBeenCalledTimes(1);
  });

  it("sends a gated person on a personal trip to the plan gate", () => {
    mocks.gated = true;
    mocks.queries[TRIP] = trip;
    render(<AddTripStopScreen />);
    expect(screen.getByText("redirect /plan-gate")).toBeTruthy();
    expect(screen.queryByTestId("add-trip-stop-search")).toBeNull();
  });

  it("keeps a gated person on a list's trip, without their saves", () => {
    mocks.gated = true;
    mocks.queries[TRIP] = { ...trip, listId: "list-1" };
    render(<AddTripStopScreen />);
    expect(screen.getByTestId("add-trip-stop-search")).toBeTruthy();
    expect(screen.queryByText("tripPlanner.fromSaves")).toBeNull();
  });

  it("names the city and picks the asked day among every day and Unplanned", () => {
    mocks.queries[TRIP] = trip;
    render(<AddTripStopScreen />);
    const placeholder = 'tripPlanner.searchPlaceholder {"city":"Austin"}';
    const input = screen.getByTestId("add-trip-stop-search");
    expect(input.getAttribute("placeholder")).toBe(placeholder);
    expect(input.getAttribute("aria-label")).toBe(placeholder);
    expect(screen.getByText("tripPlanner.addTo")).toBeTruthy();
    const chips = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-pressed"));
    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("says when no saves are left, and only once they have loaded", () => {
    mocks.queries[TRIP] = trip;
    const { rerender } = render(<AddTripStopScreen />);
    expect(screen.getByText("tripPlanner.fromSaves")).toBeTruthy();
    expect(screen.queryByText("tripPlanner.noSavesLeft")).toBeNull();
    mocks.queries[TRIP_SAVES] = [];
    rerender(<AddTripStopScreen />);
    expect(screen.getByText("tripPlanner.noSavesLeft")).toBeTruthy();
  });

  it("marks a result already on the trip", () => {
    mocks.queries[TRIP] = trip;
    mocks.search = { status: "done", places: [found, already] };
    render(<AddTripStopScreen />);
    type("add-trip-stop-search", "taco");
    expect(
      screen.getByRole("button", { name: "Odd Duck, tripPlanner.onTrip" }),
    ).toBeTruthy();
    expect(screen.getByText("tripPlanner.onTrip")).toBeTruthy();
  });

  it("adds a found place to the chosen day and closes", async () => {
    mocks.queries[TRIP] = trip;
    mocks.search = { status: "done", places: [found] };
    render(<AddTripStopScreen />);
    const chips = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-pressed"));
    fireEvent.click(chips[0] as HTMLElement);
    type("add-trip-stop-search", "taco");
    fireEvent.click(
      screen.getByRole("button", { name: "Veracruz, East Austin" }),
    );
    await waitFor(() => expect(mocks.backOrHome).toHaveBeenCalledTimes(1));
    expect(mocks.addStop).toHaveBeenCalledWith(1, {
      kind: "search",
      place: found,
    });
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it("adds a save, shown with its title, to the asked day", async () => {
    mocks.queries[TRIP] = trip;
    mocks.queries[TRIP_SAVES] = [
      { itemId: "i1", name: "Franklin", title: "BBQ reel" },
    ];
    render(<AddTripStopScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Franklin, BBQ reel" }));
    await waitFor(() => expect(mocks.backOrHome).toHaveBeenCalledTimes(1));
    expect(mocks.addStop).toHaveBeenCalledWith(2, {
      kind: "save",
      itemId: "i1",
      name: "Franklin",
    });
  });

  it("stays open when adding fails", async () => {
    mocks.addStop.mockResolvedValue(false);
    mocks.queries[TRIP] = trip;
    mocks.queries[TRIP_SAVES] = [
      { itemId: "i1", name: "Franklin", title: "BBQ reel" },
    ];
    render(<AddTripStopScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Franklin, BBQ reel" }));
    await waitFor(() => expect(mocks.addStop).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Franklin, BBQ reel",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(mocks.backOrHome).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
