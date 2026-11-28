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
  dropped: undefined as number | undefined,
  success: vi.fn(),
  listed: undefined as
    | { places: { name: string }[]; version: string; ready: boolean }
    | undefined,
  savePlaces: vi.fn(),
  freshPlaces: vi.fn(),
  admit: vi.fn(),
  passed: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("convex/react", () => ({
  useQuery: () => mocks.listed,
  useMutation: () => mocks.savePlaces,
  useConvex: () => ({ query: mocks.freshPlaces }),
}));
vi.mock("@/lib/pro-gate", () => ({
  useProGate: () => ({ admit: mocks.admit, passed: mocks.passed }),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/undo-bar", () => ({
  UndoBar: vi.fn(
    ({ message, onUndo }: { message: string | null; onUndo: () => void }) =>
      message ? (
        <div>
          {message}
          <button onClick={onUndo}>common.undo</button>
        </div>
      ) : null,
  ),
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
    accessibilityLabel,
  }: {
    children?: ReactNode;
    title?: string;
    onPress: () => void;
    accessibilityLabel?: string;
  }) => (
    <button aria-label={accessibilityLabel} onClick={onPress}>
      {title ?? children}
    </button>
  ),
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
vi.mock("@/lib/haptics", () => ({
  haptics: { landing: mocks.impact, success: mocks.success },
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
  useDroppedPins: (count: number) => mocks.dropped ?? count,
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: vi.fn(fakes.passThrough) },
  useReducedMotion: () => false,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({
    rt: { screen: { height: 800 }, insets: { top: 0, bottom: 0 } },
    theme: { gap: (n: number) => n * 8, colors: { muted: "gray" } },
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
  mocks.dropped = undefined;
  mocks.save = undefined;
  mocks.impact.mockReset();
  mocks.success.mockReset();
  mocks.listed = undefined;
  mocks.savePlaces.mockReset().mockResolvedValue(null);
  mocks.freshPlaces.mockReset();
  mocks.admit.mockReset().mockResolvedValue("go");
  mocks.passed.mockReset();
  mocks.captureError.mockReset();
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

it.each(["ios", "android"])(
  "lands each new pin once on %s and finishes once",
  (platform) => {
    vi.stubEnv("EXPO_OS", platform);
    mocks.save = {
      _id: "item-1",
      status: "ready",
      cities: ["Austin"],
      placePins: [
        { name: "Uchi", lat: 30.26, lng: -97.75, city: "Austin" },
        { name: "Odd Duck", lat: 30.25, lng: -97.76, city: "Austin" },
      ],
    };
    mocks.dropped = 0;
    const { rerender } = render(<SpotsScreen />);
    expect(mocks.impact).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    mocks.dropped = 1;
    rerender(<SpotsScreen />);
    expect(mocks.impact).toHaveBeenCalledOnce();
    rerender(<SpotsScreen />);
    expect(mocks.impact).toHaveBeenCalledOnce();
    mocks.dropped = 2;
    rerender(<SpotsScreen />);
    expect(mocks.success).toHaveBeenCalledOnce();
    mocks.focused = false;
    rerender(<SpotsScreen />);
    mocks.focused = true;
    rerender(<SpotsScreen />);
    expect(mocks.success).toHaveBeenCalledOnce();
  },
);

it("does not play hidden landings on return", () => {
  mocks.save = {
    _id: "item-1",
    status: "ready",
    cities: ["Austin"],
    placePins: [{ name: "Uchi", lat: 30.26, lng: -97.75, city: "Austin" }],
  };
  mocks.focused = false;
  const { rerender } = render(<SpotsScreen />);
  mocks.focused = true;
  rerender(<SpotsScreen />);
  expect(mocks.success).not.toHaveBeenCalled();
  expect(mocks.impact).not.toHaveBeenCalled();
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
  expect(mocks.success).toHaveBeenCalledOnce();
  expect(mocks.capture).toHaveBeenCalledWith("share_spots_revealed", {
    pin_count: 2,
    waited_ms: 0,
  });
  fireEvent.click(screen.getByText('spots.openCity {"city":"Austin"}'));
  expect(mocks.dismissTo).toHaveBeenCalledWith({
    pathname: "/(app)/(tabs)/(map)",
    params: { city: "Austin", save: "item-1" },
  });
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/city/[name]",
    params: { name: "Austin" },
  });
  expect(mocks.dismissTo.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.push.mock.invocationCallOrder[0],
  );
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("goes back to the Map on the save's city when Done is tapped", () => {
  mocks.save = {
    _id: "item-1",
    status: "ready",
    cities: ["Austin"],
    placePins: [{ name: "Uchi", lat: 30.26, lng: -97.75, city: "Austin" }],
  };
  render(<SpotsScreen />);
  fireEvent.click(screen.getByText("common.done"));
  expect(mocks.replace).toHaveBeenCalledWith({
    pathname: "/(app)/(tabs)/(map)",
    params: { city: "Austin", save: "item-1" },
  });
});

it("goes to the Map when the save has no place", () => {
  mocks.save = { _id: "item-1", status: "ready", cities: [] };
  render(<SpotsScreen />);
  expect(mocks.replace).toHaveBeenCalledWith("/(app)/(tabs)/(map)");
  expect(mocks.capture).toHaveBeenCalledWith("share_spots_skipped", {
    reason: "no_place",
    waited_ms: 0,
  });
});

it("goes to the Map when the revealed save is deleted from its detail screen", () => {
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
  expect(mocks.replace).toHaveBeenCalledWith("/(app)/(tabs)/(map)");
  expect(mocks.capture).toHaveBeenCalledTimes(1);
});

it("stays put under the detail screen while a retry runs, then goes to the Map on return", () => {
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
  expect(mocks.replace).toHaveBeenCalledWith("/(app)/(tabs)/(map)");
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

const uchi = { name: "Uchi", lat: 30.26, lng: -97.75, city: "Austin" };
const duck = { name: "Odd Duck", lat: 30.25, lng: -97.76, city: "Austin" };
const bakery = { name: "Bakery", city: "Austin" };
const removeLabel = (name: string) =>
  `spots.removePlace ${JSON.stringify({ name })}`;
function twoSpots() {
  mocks.save = {
    _id: "item-1",
    status: "ready",
    cities: ["Austin"],
    placePins: [uchi, duck],
  };
  mocks.listed = { places: [uchi, duck, bakery], version: "v1", ready: true };
}
const flush = () => act(() => Promise.resolve());

it("removes a spot with undo and writes the kept places once on Done", async () => {
  twoSpots();
  const { unmount } = render(<SpotsScreen />);
  fireEvent.click(screen.getByLabelText(removeLabel("Odd Duck")));
  expect(screen.queryByText("Odd Duck")).toBeNull();
  expect(screen.getByText('spots.count {"count":1}')).toBeTruthy();
  fireEvent.click(screen.getByText("common.undo"));
  expect(screen.getByText("Odd Duck")).toBeTruthy();
  fireEvent.click(screen.getByLabelText(removeLabel("Odd Duck")));
  expect(mocks.savePlaces).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("common.done"));
  await flush();
  unmount();
  await flush();
  expect(mocks.savePlaces).toHaveBeenCalledOnce();
  expect(mocks.savePlaces).toHaveBeenCalledWith({
    itemId: "item-1",
    version: "v1",
    places: [uchi, bakery],
  });
  expect(mocks.admit).not.toHaveBeenCalled();
  expect(
    mocks.capture.mock.calls.filter(([name]) => name === "share_spots_left"),
  ).toEqual([["share_spots_left", { pin_count: 2, removed: 1, via: "done" }]]);
});

it("writes staged removals when the person goes back", async () => {
  twoSpots();
  const { unmount } = render(<SpotsScreen />);
  fireEvent.click(screen.getByLabelText(removeLabel("Uchi")));
  unmount();
  await flush();
  expect(mocks.savePlaces).toHaveBeenCalledWith({
    itemId: "item-1",
    version: "v1",
    places: [duck, bakery],
  });
  expect(mocks.capture).toHaveBeenCalledWith("share_spots_left", {
    pin_count: 2,
    removed: 1,
    via: "back",
  });
});

it("writes nothing when no spot was removed", async () => {
  twoSpots();
  render(<SpotsScreen />);
  fireEvent.click(screen.getByText("common.done"));
  await flush();
  expect(mocks.savePlaces).not.toHaveBeenCalled();
});

it("hides remove until every pin has dropped", () => {
  twoSpots();
  mocks.dropped = 1;
  render(<SpotsScreen />);
  expect(screen.queryByLabelText(removeLabel("Uchi"))).toBeNull();
  expect(screen.queryByText("spots.fixPlaces")).toBeNull();
});

it("retries once against a fresh list, then reports a failed write", async () => {
  twoSpots();
  mocks.savePlaces.mockRejectedValueOnce(new Error("Places changed"));
  mocks.freshPlaces.mockResolvedValue({
    places: [uchi, duck],
    version: "v2",
    ready: true,
  });
  const { unmount } = render(<SpotsScreen />);
  fireEvent.click(screen.getByLabelText(removeLabel("Odd Duck")));
  unmount();
  await flush();
  await flush();
  expect(mocks.savePlaces).toHaveBeenLastCalledWith({
    itemId: "item-1",
    version: "v2",
    places: [uchi],
  });
  expect(mocks.captureError).not.toHaveBeenCalled();
  mocks.savePlaces.mockRejectedValue(new Error("Places changed"));
  twoSpots();
  render(<SpotsScreen />);
  fireEvent.click(screen.getByLabelText(removeLabel("Odd Duck")));
  cleanup();
  await flush();
  await flush();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "spots_removal_failed",
    expect.any(Error),
  );
});

it("reports a failed write when the fresh list cannot be read", async () => {
  twoSpots();
  mocks.savePlaces.mockRejectedValueOnce(new Error("Places changed"));
  mocks.freshPlaces.mockRejectedValueOnce(new Error("offline"));
  render(<SpotsScreen />);
  fireEvent.click(screen.getByLabelText(removeLabel("Odd Duck")));
  cleanup();
  await flush();
  await flush();
  expect(mocks.captureError).toHaveBeenCalledWith(
    "spots_removal_failed",
    expect.any(Error),
  );
});

it("stays on the reveal when every spot is removed", async () => {
  mocks.save = {
    _id: "item-1",
    status: "ready",
    cities: ["Austin"],
    placePins: [uchi],
  };
  mocks.listed = { places: [uchi], version: "v1", ready: true };
  const { rerender } = render(<SpotsScreen />);
  fireEvent.click(screen.getByLabelText(removeLabel("Uchi")));
  expect(screen.getByText("spots.noneLeft")).toBeTruthy();
  expect(screen.queryByText('spots.openCity {"city":"Austin"}')).toBeNull();
  mocks.save = { ...mocks.save, cities: [], placePins: [] };
  rerender(<SpotsScreen />);
  expect(screen.getByText("spots.noneLeft")).toBeTruthy();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it("writes removals before Edit places and opens it through the Pro gate", async () => {
  twoSpots();
  render(<SpotsScreen />);
  fireEvent.click(screen.getByLabelText(removeLabel("Odd Duck")));
  fireEvent.click(screen.getByText("spots.fixPlaces"));
  await flush();
  await flush();
  expect(mocks.capture).toHaveBeenCalledWith("share_spots_fix_opened", {
    pin_count: 2,
    staged_removals: 1,
  });
  expect(mocks.savePlaces).toHaveBeenCalledOnce();
  expect(mocks.savePlaces.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.admit.mock.invocationCallOrder[0],
  );
  expect(mocks.push).toHaveBeenCalledWith({
    pathname: "/edit-save-places",
    params: { itemId: "item-1" },
  });
});

it("stays on the reveal when the Pro gate does not let Edit places open", async () => {
  twoSpots();
  mocks.admit.mockResolvedValue("paywalled");
  render(<SpotsScreen />);
  fireEvent.click(screen.getByText("spots.fixPlaces"));
  await flush();
  await flush();
  expect(mocks.savePlaces).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("writes staged removals before a shared list copies the save's places", async () => {
  const { AlsoAddTo } = await import("@/components/shared-list/also-add-to");
  twoSpots();
  render(<SpotsScreen />);
  fireEvent.click(screen.getByLabelText(removeLabel("Odd Duck")));
  const props = vi.mocked(AlsoAddTo).mock.lastCall?.[0];
  await act(() => props?.beforeToggle?.() ?? Promise.resolve());
  expect(mocks.savePlaces).toHaveBeenCalledWith({
    itemId: "item-1",
    version: "v1",
    places: [uchi, bakery],
  });
  expect(screen.queryByText("common.undo")).toBeNull();
});

it("writes a removal again on leaving when an earlier write failed", async () => {
  const { AlsoAddTo } = await import("@/components/shared-list/also-add-to");
  twoSpots();
  mocks.savePlaces.mockRejectedValueOnce(new Error("offline"));
  mocks.freshPlaces.mockRejectedValueOnce(new Error("offline"));
  const { unmount } = render(<SpotsScreen />);
  fireEvent.click(screen.getByLabelText(removeLabel("Odd Duck")));
  const props = vi.mocked(AlsoAddTo).mock.lastCall?.[0];
  await act(() => props?.beforeToggle?.() ?? Promise.resolve());
  expect(mocks.captureError).toHaveBeenCalledWith(
    "spots_removal_failed",
    expect.any(Error),
  );
  unmount();
  await flush();
  expect(mocks.savePlaces).toHaveBeenCalledTimes(2);
  expect(mocks.savePlaces).toHaveBeenLastCalledWith({
    itemId: "item-1",
    version: "v1",
    places: [uchi, bakery],
  });
});

it("logs a back exit, not fix, when the Pro gate keeps the person on the reveal", async () => {
  twoSpots();
  mocks.admit.mockResolvedValue("paywalled");
  const { unmount } = render(<SpotsScreen />);
  fireEvent.click(screen.getByText("spots.fixPlaces"));
  await flush();
  await flush();
  unmount();
  await flush();
  expect(
    mocks.capture.mock.calls.filter(([name]) => name === "share_spots_left"),
  ).toEqual([["share_spots_left", { pin_count: 2, removed: 0, via: "back" }]]);
});
