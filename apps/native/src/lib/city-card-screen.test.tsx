// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { type ReactNode, useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CityCardScreen from "@/app/(app)/city-card";

const mocks = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  counts: [] as unknown[],
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/entitlement", () => ({ openPaywall: vi.fn() }));
vi.mock("@/lib/haptics", () => ({
  haptics: { success: vi.fn(), selection: vi.fn() },
}));
vi.mock("@/lib/screen-dismiss", () => ({ backOrHome: vi.fn() }));
vi.mock("@/lib/use-city-card-share", () => ({
  useCityCardShare: (_card: unknown, _city: string, counts: unknown) => {
    mocks.counts.push(counts);
    return { sharing: false, share: vi.fn() };
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (query: { name: string }) => ({
    data: mocks.queries[query.name],
    isError: false,
  }),
}));
vi.mock("@convex-dev/react-query", async () => {
  const { getFunctionName } = await import("convex/server");
  return { convexQuery: (fn: never) => ({ name: getFunctionName(fn) }) };
});
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }));
vi.mock("expo-router", () => ({
  Stack: {
    Screen: vi.fn(() => null),
    Toolbar: Object.assign(
      ({ children }: { children: ReactNode }) => <div>{children}</div>,
      { Button: vi.fn(() => null) },
    ),
  },
  useLocalSearchParams: () => ({ city: "Austin" }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@shopify/react-native-skia", () => ({
  Canvas: vi.fn(() => null),
  Path: vi.fn(() => null),
}));
vi.mock("@/components/city/progress-bar", () => ({
  ProgressBar: vi.fn(() => null),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(({ title }: { title: string }) => <button>{title}</button>),
}));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => <span>loader</span>),
}));
vi.mock("@/components/empty-state", () => ({
  EmptyState: vi.fn(({ title }: { title: string }) => <span>{title}</span>),
}));
vi.mock("@/components/ui/header-icon-button", () => ({
  HeaderIconButton: vi.fn(() => null),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: (_, name) => ({ name: String(name) }) }),
    absoluteFill: {},
  },
  useUnistyles: () => ({
    theme: { gap: (n: number) => n * 8, colors: {}, type: {} },
    rt: { screen: { width: 390, height: 844 } },
  }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Alert: { alert: vi.fn() },
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  View: vi.fn(LaidOutView),
}));

function styleNames(style: unknown): string[] {
  if (Array.isArray(style)) return style.flatMap(styleNames);
  const name = (style as { name?: unknown } | null | undefined)?.name;
  return typeof name === "string" ? [name] : [];
}

function LaidOutView({
  children,
  style,
  onLayout,
}: {
  children?: ReactNode;
  style?: unknown;
  onLayout?: (event: {
    nativeEvent: { layout: { width: number; height: number } };
  }) => void;
}) {
  const laid = useRef(false);
  useEffect(() => {
    if (laid.current || onLayout === undefined) return;
    laid.current = true;
    onLayout({ nativeEvent: { layout: { width: 300, height: 420 } } });
  });
  return <div data-styles={styleNames(style).join(" ")}>{children}</div>;
}

const ITEMS = "items:listCityItems";
const VISITS = "placeVisits:listVisits";

const museum = {
  name: "Blanton",
  lat: 30.26,
  lng: -97.74,
  appleId: "A",
  category: "Museum",
};
const theater = {
  name: "Blanton",
  lat: 30.29,
  lng: -97.74,
  appleId: "B",
  category: "Theater",
};
const landmark = {
  name: "Franklin Barbecue",
  lat: 30.27,
  lng: -97.75,
  appleId: "X",
  category: "Landmark",
};

function wentBubbles(): string[] {
  return [...document.querySelectorAll('[data-styles~="bubbleWent"]')]
    .map((bubble) => bubble.textContent ?? "")
    .sort();
}

beforeEach(() => {
  mocks.counts = [];
  mocks.queries = {
    [ITEMS]: [
      {
        _id: "item-1",
        title: "Austin",
        cities: ["Austin"],
        placePins: [museum, theater, landmark],
      },
    ],
  };
});

describe("city card", () => {
  it("waits for the marks before drawing the card", () => {
    render(<CityCardScreen />);
    expect(screen.getByText("loader")).toBeTruthy();
    expect(wentBubbles()).toEqual([]);
  });

  it("rings and counts only the places the marks were made on", () => {
    mocks.queries[VISITS] = [
      { key: "blanton", spots: [{ lat: 30.26, lng: -97.74, appleId: "A" }] },
      {
        key: "franklinbbq",
        spots: [{ lat: 30.2701, lng: -97.7501, appleId: "X" }],
      },
    ];
    render(<CityCardScreen />);
    expect(
      screen.getByText('cityProgress.visited {"count":3,"visited":"2"}'),
    ).toBeTruthy();
    expect(wentBubbles()).toEqual(["📸", "🏛️"].sort());
    expect(mocks.counts.at(-1)).toEqual({ place_count: 3, visited_count: 2 });
  });

  it("rings every place of a name marked by an older build", () => {
    mocks.queries[VISITS] = [{ key: "blanton" }];
    render(<CityCardScreen />);
    expect(wentBubbles()).toEqual(["🎭", "🏛️"].sort());
    expect(mocks.counts.at(-1)).toEqual({ place_count: 3, visited_count: 2 });
  });

  it("says how many places there are before any is visited", () => {
    mocks.queries[VISITS] = [];
    render(<CityCardScreen />);
    expect(screen.getByText('homePlaces.spotCount {"count":3}')).toBeTruthy();
    expect(wentBubbles()).toEqual([]);
  });
});
