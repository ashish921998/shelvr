// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TabBar } from "@/components/tab-bar";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  guard: vi.fn(async (action?: () => void) => {
    action?.();
    return true;
  }),
  loading: false,
  keyboard: false,
  os: "ios",
}));

vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/lib/free-plan", () => ({
  useSaveGuard: () => ({ guard: mocks.guard, loading: mocks.loading }),
}));
vi.mock("@/lib/use-keyboard-visible", () => ({
  useKeyboardVisible: () => mocks.keyboard,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mocks.os;
    },
  },
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
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
      <button onClick={onPress} aria-label={accessibilityLabel}>
        {children}
      </button>
    ),
  ),
}));

const routes = [
  { key: "home-key", name: "(home)" },
  { key: "map-key", name: "(map)" },
  { key: "trips-key", name: "(trips)" },
];
const titles: Record<string, string> = {
  "home-key": "Home",
  "map-key": "Map",
  "trips-key": "My trips",
};

function bar(index: number, prevented = false) {
  const emit = vi.fn(() => ({ defaultPrevented: prevented }));
  const navigateToTab = vi.fn();
  const props = {
    state: { routes, index },
    descriptors: Object.fromEntries(
      routes.map((r) => [r.key, { options: { title: titles[r.key] } }]),
    ),
    emitter: { emit },
    navigateToTab,
  } as unknown as BottomTabBarProps;
  render(<TabBar {...props} />);
  return { emit, navigateToTab };
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.guard.mockClear();
  mocks.loading = false;
  mocks.keyboard = false;
  mocks.os = "ios";
});

describe("tabs", () => {
  it("shows the two tabs you are not on, in route order", () => {
    bar(1);
    const labels = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["Home", "Add", "My trips"]);
  });

  it("emits tabPress and navigates", () => {
    const { emit, navigateToTab } = bar(0);
    fireEvent.click(screen.getByRole("button", { name: "My trips" }));
    expect(emit).toHaveBeenCalledWith({
      type: "tabPress",
      target: "trips-key",
      canPreventDefault: true,
    });
    expect(navigateToTab).toHaveBeenCalledWith("trips-key");
  });

  it("does not navigate when the press is default-prevented", () => {
    const { emit, navigateToTab } = bar(0, true);
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(emit).toHaveBeenCalled();
    expect(navigateToTab).not.toHaveBeenCalled();
  });
});

describe("add button", () => {
  it("runs the save guard, then opens Add", () => {
    bar(0);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(mocks.guard).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/add");
  });

  it("does nothing while the guard is loading", () => {
    mocks.loading = true;
    bar(0);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("keyboard", () => {
  it("hides the bar on Android while the keyboard is up", () => {
    mocks.os = "android";
    mocks.keyboard = true;
    bar(0);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the bar on iOS with the keyboard up", () => {
    mocks.keyboard = true;
    bar(0);
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });
});
