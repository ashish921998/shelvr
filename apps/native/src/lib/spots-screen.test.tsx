// @vitest-environment jsdom
import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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
  dismissTo: vi.fn(),
  push: vi.fn(),
  focused: true,
  save: undefined as Save | null | undefined,
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
  useRouter: () => ({
    replace: mocks.replace,
    dismissTo: mocks.dismissTo,
    push: mocks.push,
  }),
  useLocalSearchParams: () => ({ id: "item-1" }),
  useIsFocused: () => mocks.focused,
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

vi.mock("@/components/shared-list/also-add-to", () => ({
  AlsoAddTo: vi.fn(() => null),
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
  mocks.dismissTo.mockReset();
  mocks.push.mockReset();
  mocks.focused = true;
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
  expect(screen.getByText("from Austin's best tacos")).toBeTruthy();
  expect(screen.getAllByText(/^label /)).toHaveLength(1);
  expect(mocks.success).toHaveBeenCalledWith("success");
  expect(mocks.capture).toHaveBeenCalledWith("share_spots_revealed", {
    pin_count: 2,
    waited_ms: 0,
  });
  fireEvent.click(screen.getByText('spots.openCity {"city":"Austin"}'));
  expect(mocks.dismissTo).toHaveBeenCalledWith("/(app)/(tabs)/(home)");
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/city/[name]",
    params: { name: "Austin" },
  });
  expect(mocks.dismissTo.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.push.mock.invocationCallOrder[0],
  );
  expect(mocks.replace).not.toHaveBeenCalled();
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

it("goes Home when the revealed save is deleted from its detail screen", () => {
  mocks.save = {
    _id: "item-1",
    status: "ready",
    cities: ["Austin"],
    placePins: [{ name: "Uchi", lat: 30.26, lng: -97.75, city: "Austin" }],
  };
  const { rerender } = render(<SpotsScreen />);
  expect(mocks.replace).not.toHaveBeenCalled();
  mocks.save = null;
  rerender(<SpotsScreen />);
  expect(mocks.replace).toHaveBeenCalledWith("/(app)/(tabs)/(home)");
  expect(mocks.capture).toHaveBeenCalledTimes(1);
});

it("stays put under the detail screen while a retry runs, then goes Home on return", () => {
  mocks.save = {
    _id: "item-1",
    status: "ready",
    cities: ["Austin"],
    placePins: [{ name: "Uchi", lat: 30.26, lng: -97.75, city: "Austin" }],
  };
  const { rerender } = render(<SpotsScreen />);
  mocks.focused = false;
  mocks.save = { ...mocks.save, status: "processing" };
  rerender(<SpotsScreen />);
  act(() => {
    vi.advanceTimersByTime(26_000);
  });
  expect(mocks.replace).not.toHaveBeenCalled();
  mocks.focused = true;
  rerender(<SpotsScreen />);
  expect(mocks.replace).toHaveBeenCalledWith("/(app)/(tabs)/(home)");
});

it("shows the spots again when a retry finished before the return", () => {
  mocks.save = {
    _id: "item-1",
    status: "ready",
    cities: ["Austin"],
    placePins: [{ name: "Uchi", lat: 30.26, lng: -97.75, city: "Austin" }],
  };
  const { rerender } = render(<SpotsScreen />);
  const ready = mocks.save;
  mocks.focused = false;
  mocks.save = { ...ready, status: "processing" };
  rerender(<SpotsScreen />);
  act(() => {
    vi.advanceTimersByTime(26_000);
  });
  mocks.save = ready;
  rerender(<SpotsScreen />);
  mocks.focused = true;
  rerender(<SpotsScreen />);
  expect(screen.getByText("Uchi")).toBeTruthy();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("adds spots the save gains after the reveal", () => {
  mocks.save = {
    _id: "item-1",
    status: "ready",
    cities: ["Austin"],
    placePins: [{ name: "Uchi", lat: 30.26, lng: -97.75, city: "Austin" }],
  };
  const { rerender } = render(<SpotsScreen />);
  expect(screen.queryByText("Odd Duck")).toBeNull();
  mocks.save = {
    ...mocks.save,
    placePins: [
      { name: "Uchi", lat: 30.26, lng: -97.75, city: "Austin" },
      {
        name: "Odd Duck",
        lat: 30.25,
        lng: -97.76,
        city: "Austin",
        category: "Restaurant",
      },
    ],
  };
  rerender(<SpotsScreen />);
  expect(screen.getByText("Odd Duck")).toBeTruthy();
  expect(screen.getByText("label Restaurant")).toBeTruthy();
  expect(mocks.capture).toHaveBeenCalledTimes(1);
});
