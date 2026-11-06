// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapPageScreen from "@/app/(app)/map-page";
import type { MapPage, MapPageCity } from "@/lib/public-map";

type PressableProps = {
  children: ReactNode | ((state: { pressed: boolean }) => ReactNode);
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
};

const mocks = vi.hoisted(() => ({
  page: undefined as unknown,
  surface: undefined as unknown,
  from: undefined as string | undefined,
  openLink: vi.fn(),
  backOrHome: vi.fn(),
}));

vi.mock("@/lib/i18n", async () => {
  const en = (await import("@/locales/en.json")).default as Record<
    string,
    string | Record<string, string>
  >;
  return {
    useAppLocale: () => {},
    t: (key: string, params: Record<string, string | number> = {}) => {
      const entry = en[key];
      const text =
        typeof entry === "string"
          ? entry
          : params.count === 1
            ? entry.one
            : entry.other;
      return text.replace(/%\{(\w+)\}/g, (_, name: string) =>
        String(name === "formattedCount" ? params.count : params[name]),
      );
    },
  };
});
vi.mock("@/lib/public-map", () => ({
  useMapPage: (surface: string) => {
    mocks.surface = surface;
    return mocks.page;
  },
}));
vi.mock("@/lib/open-link", () => ({ openLink: mocks.openLink }));
vi.mock("@/lib/screen-dismiss", () => ({ backOrHome: mocks.backOrHome }));
vi.mock("@/lib/haptics", () => ({ haptics: { selection: vi.fn() } }));
vi.mock("expo-router", () => {
  const Toolbar = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Button: vi.fn(
        ({
          children,
          onPress,
        }: {
          children: ReactNode;
          onPress: () => void;
        }) => (
          <button type="button" onClick={onPress}>
            {children}
          </button>
        ),
      ),
    },
  );
  return {
    Stack: { Screen: vi.fn(() => null), Toolbar },
    useLocalSearchParams: () => ({ from: mocks.from }),
    useRouter: () => ({ back: vi.fn(), canGoBack: () => true }),
  };
});
vi.mock("@/components/empty-state", () => ({
  EmptyState: vi.fn(
    ({ title, message }: { title: string; message: string }) => (
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    ),
  ),
}));
vi.mock("@/components/map/map-page-save-all", () => ({
  MapPageSaveAll: vi.fn(() => <div data-testid="map-page-save-all-card" />),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <div>loading-screen</div>),
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(() => null),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(
    ({ children, testID }: { children: ReactNode; testID?: string }) => (
      <span data-testid={testID}>{children}</span>
    ),
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({
      title,
      disabled,
      loading,
      onPress,
      testID,
    }: {
      title: string;
      disabled?: boolean;
      loading?: boolean;
      onPress: () => void;
      testID?: string;
    }) => (
      <button
        type="button"
        data-testid={testID}
        data-loading={loading ? "true" : "false"}
        disabled={disabled}
        onClick={onPress}
      >
        {title}
      </button>
    ),
  ),
}));
vi.mock("@/components/trip-planner/trip-planner-form", () => ({
  FormSection: vi.fn(
    ({
      title,
      hint,
      children,
    }: {
      title: string;
      hint?: string;
      children: ReactNode;
    }) => (
      <section>
        <h3>{title}</h3>
        <p>{hint}</p>
        {children}
      </section>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
  useUnistyles: () => ({
    theme: {
      colors: { foreground: "#000", surface: "#fff" },
      type: { title: {} },
      control: { minHeight: 48, pressRetentionOffset: 12 },
    },
  }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      disabled,
      testID,
      accessibilityLabel,
    }: PressableProps) => (
      <button
        type="button"
        data-testid={testID}
        aria-label={accessibilityLabel}
        disabled={disabled}
        onClick={onPress}
      >
        {typeof children === "function"
          ? children({ pressed: false })
          : children}
      </button>
    ),
  ),
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const PAGE_URL = `https://shelvr-web.vercel.app/m/${TOKEN}`;

function cities(picked: string[] = []): MapPageCity[] {
  return [
    {
      city: "Mexico City",
      places: [
        { name: "Contramar", went: true },
        { name: "Café Avellaneda", went: false },
        { name: "Panadería Rosetta", went: false },
        { name: "Taquería Orinoco", went: false },
      ],
    },
    {
      city: "Austin",
      places: [
        { name: "Jo's Coffee", went: false },
        { name: "Houndstooth Coffee", went: false },
      ],
    },
    { city: "Lisbon", places: [] },
  ].map((row) => ({
    ...row,
    picked: picked.includes(row.city),
    disabled: false,
  }));
}

function page(over: Partial<MapPage> = {}): MapPage {
  return {
    status: "off",
    url: null,
    cities: cities(),
    pickedCount: 0,
    edited: false,
    canSubmit: false,
    showsBeen: false,
    busy: false,
    toggle: vi.fn(),
    submit: vi.fn(async () => {}),
    share: vi.fn(async () => {}),
    rotate: vi.fn(),
    turnOff: vi.fn(),
    ...over,
  };
}

function show(over: Partial<MapPage> = {}): MapPage {
  const current = page(over);
  mocks.page = current;
  render(<MapPageScreen />);
  return current;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from = undefined;
  mocks.openLink.mockResolvedValue(true);
});
afterEach(() => cleanup());

describe("map page sheet states", () => {
  it("shows a loader while either query loads", () => {
    show({ status: "loading" });
    expect(screen.getByText("loading-screen")).toBeTruthy();
    expect(screen.queryByTestId("map-page-submit")).toBeNull();
  });

  it("shows the generic error when a query fails", () => {
    show({ status: "error" });
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Please try again in a moment.")).toBeTruthy();
  });

  it("tells a blocked owner the page is off and offers no action", () => {
    show({ status: "blocked" });
    expect(screen.getByText("Your map page is off")).toBeTruthy();
    expect(
      screen.getByText(
        "Shelvr turned it off after a report. To ask about it, use Contact Support in Settings.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("map-page-submit")).toBeNull();
  });

  it("says there is nothing to share without places", () => {
    show({ status: "empty" });
    expect(screen.getByText("No places to share yet")).toBeTruthy();
    expect(screen.queryByTestId("map-page-submit")).toBeNull();
  });

  it("lists the cities with nothing picked when the page is off", () => {
    show({ status: "off" });
    expect(
      screen.getByText(
        "Everyone with the link sees the places you saved in these cities. Places you save there later show up too.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "The page shows your first name and links places to the posts you saved them from. Your saves’ titles, notes and photos stay private.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Up to 12 cities.")).toBeTruthy();
    expect(screen.getByText("4 places")).toBeTruthy();
    expect(screen.getByText("2 places")).toBeTruthy();
    expect(screen.getByText("No places right now")).toBeTruthy();
    expect(screen.queryAllByTestId("map-page-names")).toHaveLength(0);
    expect(
      screen.getByText(
        "Places from notes and photos, and names that look like street addresses, are left out.",
      ),
    ).toBeTruthy();
    const submit = screen.getByTestId("map-page-submit");
    expect(submit.textContent).toBe("Create link");
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("map-page-link")).toBeNull();
    expect(screen.queryByTestId("map-page-new-link")).toBeNull();
    expect(screen.queryByTestId("map-page-turn-off")).toBeNull();
  });

  it("names the places under a picked city only, and mentions Been there", () => {
    const current = show({
      status: "off",
      cities: cities(["Mexico City"]),
      pickedCount: 1,
      canSubmit: true,
      showsBeen: true,
    });
    const names = screen.getAllByTestId("map-page-names");
    expect(names.map((line) => line.textContent)).toEqual([
      "Contramar (been there), Café Avellaneda, Panadería Rosetta, Taquería Orinoco",
    ]);
    expect(
      screen.getByText(
        "Everyone with the link sees the places you saved in these cities and which ones you’ve been to. Places you save there later show up too.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByText("Austin"));
    expect(current.toggle).toHaveBeenCalledWith("Austin");
    fireEvent.click(screen.getByTestId("map-page-submit"));
    expect(current.submit).toHaveBeenCalledTimes(1);
    expect(current.share).not.toHaveBeenCalled();
  });

  it("shows the link and its actions when the page is on", () => {
    const current = show({
      status: "on",
      url: PAGE_URL,
      cities: cities(["Mexico City", "Austin"]),
      pickedCount: 2,
      canSubmit: true,
    });
    expect(screen.getByText("Your link")).toBeTruthy();
    expect(screen.getByTestId("map-page-link").textContent).toBe(PAGE_URL);
    expect(screen.getAllByTestId("map-page-names")).toHaveLength(2);

    fireEvent.click(screen.getByTestId("map-page-preview"));
    expect(mocks.openLink).toHaveBeenCalledWith(PAGE_URL);

    const submit = screen.getByTestId("map-page-submit");
    expect(submit.textContent).toBe("Share link");
    fireEvent.click(submit);
    expect(current.share).toHaveBeenCalledTimes(1);
    expect(current.submit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("map-page-new-link"));
    expect(current.rotate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("map-page-turn-off"));
    expect(current.turnOff).toHaveBeenCalledTimes(1);
  });

  it("offers Save all under the cities only when the page is on", () => {
    show({
      status: "on",
      url: PAGE_URL,
      cities: cities(["Mexico City"]),
      pickedCount: 1,
      canSubmit: true,
    });
    const card = screen.getByTestId("map-page-save-all-card");
    const lastCity = screen.getByText("Lisbon");
    expect(
      lastCity.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      card.compareDocumentPosition(screen.getByTestId("map-page-submit")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    for (const status of [
      "off",
      "loading",
      "error",
      "blocked",
      "empty",
    ] as const) {
      cleanup();
      show({ status, cities: cities(["Mexico City"]), canSubmit: true });
      expect(screen.queryByTestId("map-page-save-all-card")).toBeNull();
    }
  });

  it("saves edited cities instead of sharing", () => {
    const current = show({
      status: "on",
      url: PAGE_URL,
      cities: cities(["Mexico City"]),
      pickedCount: 1,
      edited: true,
      canSubmit: true,
    });
    const submit = screen.getByTestId("map-page-submit");
    expect(submit.textContent).toBe("Save changes");
    fireEvent.click(submit);
    expect(current.submit).toHaveBeenCalledTimes(1);
    expect(current.share).not.toHaveBeenCalled();
    expect(screen.getByTestId("map-page-new-link")).toBeTruthy();
  });

  it("dims the button and holds every row and action while busy", () => {
    show({
      status: "on",
      url: PAGE_URL,
      cities: cities(["Mexico City"]),
      pickedCount: 1,
      canSubmit: true,
      busy: true,
    });
    expect(screen.getByTestId("map-page-submit").dataset.loading).toBe("true");
    for (const city of ["Mexico City", "Austin", "Lisbon"]) {
      const row = screen.getByText(city).closest("button");
      expect(row?.disabled).toBe(true);
    }
    expect(
      (screen.getByTestId("map-page-new-link") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("map-page-turn-off") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("map page sheet frame", () => {
  it("reports which surface opened it", () => {
    show();
    expect(mocks.surface).toBe("map");
    cleanup();
    mocks.from = "settings";
    show();
    expect(mocks.surface).toBe("settings");
  });

  it("closes through backOrHome", () => {
    show();
    fireEvent.click(screen.getByText("Close"));
    expect(mocks.backOrHome).toHaveBeenCalledTimes(1);
  });
});
