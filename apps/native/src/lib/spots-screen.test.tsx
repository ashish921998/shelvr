// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SpotsScreen from "@/app/(app)/spots/[id]";

type Save = {
  _id: string;
  status: string;
  cities?: string[];
  title?: string;
  placePins?: {
    name: string;
    lat: number;
    lng: number;
    city?: string;
    category?: string;
  }[];
};

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  replace: vi.fn(),
  save: undefined as Save | undefined,
  impact: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: vi.fn() },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.save, isError: false }),
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useLocalSearchParams: () => ({ id: "item-1" }),
}));
const fakes = vi.hoisted(() => ({
  passThrough: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  pressable: ({
    children,
    title,
    onPress,
  }: {
    children?: ReactNode;
    title?: string;
    onPress: () => void;
  }) => <button onClick={onPress}>{title ?? children}</button>,
}));

vi.mock("@/components/city/city-map", () => ({
  CityMap: vi.fn(({ visible }: { visible: number }) => (
    <div data-testid="map">{`visible ${visible}`}</div>
  )),
}));
vi.mock("@/components/city/save-row", () => ({
  SaveRow: vi.fn(({ item }: { item: Save }) => (
    <span>{`from ${item.title}`}</span>
  )),
}));
vi.mock("@/lib/place-category", () => ({
  placeCategoryLabel: (category?: string) =>
    category ? `label ${category}` : undefined,
}));
vi.mock("expo-haptics", () => ({
  impactAsync: mocks.impact,
  notificationAsync: mocks.success,
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("@/components/onboarding/sample-trip-map", () => ({
  PinBadge: vi.fn(({ number }: { number: number }) => <span>{number}</span>),
}));
vi.mock("@/components/ui/stitch-mark", () => ({
  StitchMark: vi.fn(() => null),
}));
vi.mock("@/components/ui/button", () => ({ Button: vi.fn(fakes.pressable) }));
vi.mock("@/lib/motion", () => ({ springIn: () => undefined }));
vi.mock("@/lib/use-dropped-pins", () => ({
  useDroppedPins: (count: number) => count,
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: vi.fn(fakes.passThrough) },
  useReducedMotion: () => false,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({
    rt: { screen: { height: 800 }, insets: { top: 0, bottom: 0 } },
    theme: { gap: (n: number) => n * 8 },
  }),
}));
vi.mock("react-native", () => ({
  Pressable: vi.fn(fakes.pressable),
  ScrollView: vi.fn(fakes.passThrough),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  View: vi.fn(fakes.passThrough),
}));

beforeEach(() => {
  vi.useFakeTimers();
  mocks.capture.mockReset();
  mocks.replace.mockReset();
  mocks.save = undefined;
  mocks.impact.mockReset();
  mocks.success.mockReset();
  vi.stubEnv("EXPO_OS", "ios");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("finds the spots while the save is read", () => {
  mocks.save = { _id: "item-1", status: "processing" };
  render(<SpotsScreen />);
  expect(screen.getByText("spots.finding")).toBeTruthy();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("drops a pinned save's spots on its city and opens that city", () => {
  mocks.save = {
    _id: "item-1",
    status: "ready",
    title: "Austin's best tacos",
    cities: ["Austin"],
    placePins: [
      {
        name: "Odd Duck",
        lat: 30.25,
        lng: -97.76,
        city: "Austin",
        category: "Restaurant",
      },
      { name: "Uchi", lat: 30.26, lng: -97.75, city: "Austin" },
    ],
  };
  render(<SpotsScreen />);
  expect(screen.getByText('spots.addedTo {"city":"Austin"}')).toBeTruthy();
  expect(screen.getByText("Odd Duck")).toBeTruthy();
  // The save the spots came from, and Apple's category only where it gave one.
  expect(screen.getByText("from Austin's best tacos")).toBeTruthy();
  expect(screen.getAllByText(/^label /)).toHaveLength(1);
  expect(mocks.success).toHaveBeenCalledWith("success");
  expect(mocks.capture).toHaveBeenCalledWith("share_spots_revealed", {
    pin_count: 2,
    waited_ms: 0,
  });
  fireEvent.click(screen.getByText('spots.openCity {"city":"Austin"}'));
  expect(mocks.replace).toHaveBeenCalledWith({
    pathname: "/city/[name]",
    params: { name: "Austin" },
  });
});

it("goes Home, as before, when the save has no place", () => {
  mocks.save = { _id: "item-1", status: "ready", cities: [] };
  render(<SpotsScreen />);
  expect(mocks.replace).toHaveBeenCalledWith("/(app)/(tabs)/(home)");
  expect(mocks.capture).toHaveBeenCalledWith("share_spots_skipped", {
    reason: "no_place",
    waited_ms: 0,
  });
});
