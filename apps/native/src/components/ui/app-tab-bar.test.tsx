// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabs } from "./app-tab-bar";

// `Tabs` comes from expo-router, so the Unistyles babel plugin never
// instruments the view it renders and cannot repaint it when the theme
// changes. These mocks reproduce that: `StyleSheet.create` runs once with the
// launch theme (as Unistyles caches it), while `useUnistyles` reports the
// active one. A stylesheet colour therefore stays frozen at the launch theme
// and only a value read from `useUnistyles` follows a switch.
const mock = vi.hoisted(() => {
  const gap = (v: number) => v * 8;
  const radius = { sm: 8, md: 11, lg: 16, xl: 24 };
  const fonts = { regular: "r", medium: "m", bold: "b", display: "d" };
  const light = {
    gap,
    radius,
    fonts,
    colors: {
      background: "#faf6ee",
      surface: "#fffdf8",
      foreground: "#2b2418",
      muted: "#8d8271",
      primary: "#e6a23c",
      primarySoft: "#f7e8cd",
      border: "#ece3d1",
    },
  };
  const dark = {
    gap,
    radius,
    fonts,
    colors: {
      background: "#191510",
      surface: "#231e16",
      foreground: "#f4eddd",
      muted: "#a2977f",
      primary: "#e6a23c",
      primarySoft: "#3a2f1c",
      border: "#332c20",
    },
  };
  // Named here so the gesture mock below assigns it rather than declaring a
  // PascalCase object method, which the naming-convention rule rejects.
  const manualGesture = () => ({});
  return {
    light,
    dark,
    manualGesture,
    theme: light as typeof light,
    tabsStyle: undefined as unknown,
  };
});

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (sheet: unknown) =>
      typeof sheet === "function" ? sheet(mock.light) : sheet,
    absoluteFillObject: {},
  },
  useUnistyles: () => ({ theme: mock.theme }),
}));

vi.mock("react-native", () => {
  const element = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Keyboard: { dismiss: vi.fn(), isVisible: () => false },
    KeyboardAvoidingView: vi.fn(element),
    Platform: { OS: "android" },
    Pressable: vi.fn(element),
    Text: vi.fn(element),
    TextInput: vi.fn(() => null),
    View: vi.fn(element),
    useWindowDimensions: () => ({ width: 400, height: 800 }),
  };
});

vi.mock("expo-router/ui", () => ({
  // Rendering no children keeps this test on the backdrop: the bar drawn inside
  // has its own theme subscription.
  Tabs: vi.fn(({ style }: { style: unknown }) => {
    mock.tabsStyle = style;
    return null;
  }),
  TabList: vi.fn(() => null),
  TabSlot: vi.fn(() => null),
  TabTrigger: vi.fn(() => null),
  useTabTrigger: () => ({ triggerProps: { isFocused: false } }),
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));
vi.mock("react-native-gesture-handler", () => ({
  Gesture: { Manual: mock.manualGesture },
  GestureDetector: vi.fn(() => null),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: vi.fn(() => null) },
  interpolate: vi.fn(),
  useAnimatedStyle: vi.fn(),
  useDerivedValue: vi.fn(),
  useSharedValue: vi.fn(),
  withSpring: vi.fn(),
  withTiming: vi.fn(),
}));
vi.mock("react-native-worklets", () => ({
  scheduleOnRN: vi.fn(),
  scheduleOnUI: vi.fn(),
}));
vi.mock("expo-haptics", () => ({
  AndroidHaptics: { Segment_Tick: 0, Virtual_Key: 1 },
  performAndroidHapticsAsync: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));

function backdropColor(): unknown {
  const style = mock.tabsStyle;
  const layers = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...layers.map((layer) => layer ?? {}))
    .backgroundColor;
}

describe("AppTabs", () => {
  beforeEach(() => {
    mock.theme = mock.light;
    mock.tabsStyle = undefined;
  });

  it("paints the backdrop the bar floats over from the active theme", () => {
    render(<AppTabs />);
    expect(backdropColor()).toBe("#faf6ee");
  });

  // The regression: with the colour taken from the stylesheet alone, this
  // backdrop keeps the launch theme's cream and shows as a light band under the
  // floating bar for the rest of the session. Re-rendering stands in for the
  // theme subscription Unistyles drives on a switch.
  it("repaints the backdrop when the theme changes after launch", () => {
    const view = render(<AppTabs />);
    mock.theme = mock.dark;
    view.rerender(<AppTabs />);
    expect(backdropColor()).toBe("#191510");
  });
});
