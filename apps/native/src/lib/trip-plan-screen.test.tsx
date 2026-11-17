// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Access } from "@/lib/access";
import TripPlanScreen from "@/app/(app)/trip-plan/[id]";
import TripsScreen from "@/app/(app)/(tabs)/(trips)/index";

type Pushed = { pathname: string; params: Record<string, string> };

const mocks = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  trip: undefined as unknown,
  trips: [] as unknown[],
  access: { kind: "pro", syncing: false } as Access,
  rename: vi.fn(),
  push: vi.fn(),
  saves: [] as boolean[],
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useAppLocale: () => "en",
  formattingLocale: () => "en-US",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/haptics", () => ({ haptics: {} }));
vi.mock("@/lib/motion", () => ({ fadeIn: {}, motion: {} }));
vi.mock("@/lib/free-plan", () => ({ useAccess: () => mocks.access }));
vi.mock("@/lib/delete-trip-plan", () => ({ useDeleteTripPlan: () => vi.fn() }));
vi.mock("@/lib/trip-share", () => ({
  useTripShare: () => ({ open: vi.fn(), loading: false }),
}));
vi.mock("@/lib/screen-dismiss", () => ({ backOrHome: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.trip, isError: false }),
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (fn: unknown, args: unknown) => ({ fn, args }),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({ isAuthenticated: true }),
    usePaginatedQuery: () => ({ status: "Exhausted", results: mocks.trips }),
    useMutation: (fn: never) =>
      getFunctionName(fn) === "tripPlannerData:renameTripPlan"
        ? mocks.rename
        : vi.fn(),
    useAction: () => vi.fn(),
  };
});
vi.mock("expo-router", () => {
  const Button = ({
    children,
    onPress,
  }: {
    children: ReactNode;
    onPress: () => void;
  }) => <button onClick={onPress}>{children}</button>;
  const Toolbar = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Button,
      Menu: vi.fn(({ children }: { children: ReactNode }) => (
        <div>{children}</div>
      )),
      MenuAction: Button,
    },
  );
  return {
    Stack: { Screen: vi.fn(() => null), Toolbar },
    Redirect: vi.fn(({ href }: { href: string }) => (
      <span>{`redirect ${href}`}</span>
    )),
    useRouter: () => ({ push: mocks.push }),
    useIsFocused: () => true,
    useLocalSearchParams: () => mocks.params,
  };
});
vi.mock("@/components/trip-planner/trip-plan-body", () => ({
  TripPlanBody: vi.fn(({ canUseSaves }: { canUseSaves: boolean }) => {
    mocks.saves.push(canUseSaves);
    return <span>trip body</span>;
  }),
}));
vi.mock("@/components/trip-planner/trip-edit-list", async (importActual) => ({
  ...(await importActual<
    typeof import("@/components/trip-planner/trip-edit-list")
  >()),
  TripEditList: vi.fn(({ header }: { header: ReactNode }) => (
    <div>{header}</div>
  )),
}));
vi.mock("@/components/account-gone-boundary", () => ({
  AccountGoneBoundary: vi.fn(({ children }: { children: ReactNode }) => (
    <>{children}</>
  )),
}));
vi.mock("@/components/ui/action-menu", () => ({
  ActionMenu: vi.fn(
    ({
      actions,
    }: {
      actions: { id: string; label: string; onPress: () => void }[];
    }) => (
      <div>
        {actions.map((action) => (
          <button key={action.id} onClick={action.onPress}>
            {action.label}
          </button>
        ))}
      </div>
    ),
  ),
}));
vi.mock("@/components/ui/undo-bar", () => ({ UndoBar: vi.fn(() => null) }));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => null),
}));
vi.mock("@/components/empty-state", () => ({ EmptyState: vi.fn(() => null) }));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(() => null),
  HeaderActionMenu: vi.fn(() => null),
}));
vi.mock("@/components/ui/button", () => ({ Button: vi.fn(() => null) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("react-native-gesture-handler", () => ({
  Gesture: {},
  GestureDetector: vi.fn(() => null),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: vi.fn(() => null), ScrollView: vi.fn(() => null) },
}));
vi.mock("react-native-worklets", () => ({ scheduleOnRN: vi.fn() }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
    hairlineWidth: 1,
  },
  useUnistyles: () => ({ theme: { colors: {}, gap: () => 0 } }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: "ios" },
  useWindowDimensions: () => ({ width: 400, height: 800 }),
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel?: string;
    }) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {children}
      </button>
    ),
  ),
  FlatList: vi.fn(
    ({
      data,
      renderItem,
    }: {
      data: unknown[];
      renderItem: (row: { item: unknown }) => ReactNode;
    }) => (
      <div>
        {data.map((item, index) => (
          <div key={index}>{renderItem({ item })}</div>
        ))}
      </div>
    ),
  ),
  TextInput: vi.fn(
    ({
      testID,
      value,
      onChangeText,
    }: {
      testID: string;
      value: string;
      onChangeText: (text: string) => void;
    }) => (
      <input
        data-testid={testID}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  ),
}));

const trip = {
  _id: "trip-1",
  name: "Lisbon weekend",
  city: "Lisbon",
  countries: ["PT"],
  dayCount: 3,
  stopCount: 0,
  pace: "balanced",
  interests: [],
  days: [[], [], []],
  unplanned: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = { id: trip._id };
  mocks.trip = trip;
  mocks.trips = [trip];
  mocks.access = { kind: "pro", syncing: false };
  mocks.saves = [];
});

describe("Edit trip from a trip card", () => {
  it("opens the editor with the saved name and keeps it on Done", () => {
    render(<TripsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "tripPlanner.edit" }));
    const pushed = mocks.push.mock.calls[0]?.[0] as Pushed;
    expect(pushed).toEqual({
      pathname: "/trip-plan/[id]",
      params: { id: trip._id, mode: "edit" },
    });

    mocks.params = pushed.params;
    render(<TripPlanScreen />);
    const name = screen.getByTestId("trip-name") as HTMLInputElement;
    expect(name.value).toBe("Lisbon weekend");
    fireEvent.click(screen.getByRole("button", { name: "common.done" }));

    expect(mocks.rename).not.toHaveBeenCalled();
    expect(screen.getByText("trip body")).toBeTruthy();
  });

  it("saves a name typed in the editor", () => {
    mocks.params = { id: trip._id, mode: "edit" };
    mocks.rename.mockResolvedValue(null);
    render(<TripPlanScreen />);
    fireEvent.change(screen.getByTestId("trip-name"), {
      target: { value: "Porto too" },
    });
    fireEvent.click(screen.getByRole("button", { name: "common.done" }));
    expect(mocks.rename).toHaveBeenCalledWith({
      tripId: trip._id,
      name: "Porto too",
    });
  });
});

describe("From your saves on a trip", () => {
  it("hides the saves rows on a personal trip once Pro has lapsed", () => {
    mocks.access = {
      kind: "free",
      limit: 5,
      used: 1,
      left: 4,
      pending: 0,
      open: true,
    };
    render(<TripPlanScreen />);
    expect(mocks.saves.at(-1)).toBe(false);
  });

  it("shows them on a personal trip with Pro", () => {
    render(<TripPlanScreen />);
    expect(mocks.saves.at(-1)).toBe(true);
  });

  it("shows them on a shared list's trip without Pro", () => {
    mocks.trip = { ...trip, listId: "list-1" };
    mocks.access = {
      kind: "free",
      limit: 5,
      used: 1,
      left: 4,
      pending: 0,
      open: true,
    };
    render(<TripPlanScreen />);
    expect(mocks.saves.at(-1)).toBe(true);
  });
});
