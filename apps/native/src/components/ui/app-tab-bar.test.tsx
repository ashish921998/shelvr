// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabs } from "./app-tab-bar";

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

  it("repaints the backdrop when the theme changes after launch", () => {
    const view = render(<AppTabs />);
    mock.theme = mock.dark;
    view.rerender(<AppTabs />);
    expect(backdropColor()).toBe("#191510");
  });
});
