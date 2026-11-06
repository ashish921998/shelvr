// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "expo-router/js-tabs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TabBar } from "@/components/tab-bar";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  plan: vi.fn(),
  cityInView: undefined as string | undefined,
  keyboard: false,
  os: "ios",
}));

vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/lib/plan-picker", () => ({
  usePlanPicker: () => ({ plan: mocks.plan, sheet: null }),
}));
vi.mock("@/lib/map-city-in-view", () => ({
  useMapCityInView: () => mocks.cityInView,
}));
vi.mock("@/lib/use-keyboard-visible", () => ({
  useKeyboardVisible: () => mocks.keyboard,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("expo-router/js-tabs", async () => {
  const { createContext } = await import("react");
  return {
    BottomTabBarHeightCallbackContext: createContext<
      ((height: number) => void) | undefined
    >(undefined),
  };
});
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { background: "#faf6ee" } } }),
}));
vi.mock("react-native", async () => {
  const { useEffect } = await import("react");
  function View({
    children,
    onLayout,
  }: {
    children?: ReactNode;
    onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void;
  }) {
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { height: 112 } } });
    });
    return <section>{children}</section>;
  }
  return {
    Platform: {
      get OS() {
        return mocks.os;
      },
    },
    View,
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
  };
});

const routes = [
  { key: "home-key", name: "(home)" },
  { key: "map-key", name: "(map)" },
  { key: "trips-key", name: "(trips)" },
];
const titles: Record<string, string> = {
  "home-key": "Library",
  "map-key": "Map",
  "trips-key": "My trips",
};

function bar(
  index: number,
  prevented = false,
  onHeight?: (height: number) => void,
) {
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
  render(
    <BottomTabBarHeightCallbackContext.Provider value={onHeight}>
      <TabBar {...props} />
    </BottomTabBarHeightCallbackContext.Provider>,
  );
  return { emit, navigateToTab };
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.plan.mockReset();
  mocks.cityInView = undefined;
  mocks.keyboard = false;
  mocks.os = "ios";
});

function labels() {
  return screen
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label"));
}

describe("tabs", () => {
  it("offers the Map from the Library", () => {
    bar(0);
    expect(labels()).toEqual(["Map", "Add", "Plan a date"]);
  });

  it("offers the Library from the Map and from Trips", () => {
    bar(1);
    expect(labels()).toEqual(["Library", "Add", "Plan a date"]);
    cleanup();
    bar(2);
    expect(labels()).toEqual(["Library", "Add", "Plan a date"]);
  });

  it("emits tabPress and navigates", () => {
    const { emit, navigateToTab } = bar(1);
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(emit).toHaveBeenCalledWith({
      type: "tabPress",
      target: "home-key",
      canPreventDefault: true,
    });
    expect(navigateToTab).toHaveBeenCalledWith("home-key");
  });

  it("does not navigate when the press is default-prevented", () => {
    const { emit, navigateToTab } = bar(0, true);
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(emit).toHaveBeenCalled();
    expect(navigateToTab).not.toHaveBeenCalled();
  });
});

describe("add button", () => {
  it("opens the Add spots sheet", () => {
    bar(0);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(mocks.push).toHaveBeenCalledWith("/add-spots");
  });
});

describe("plan a date", () => {
  it("plans for the city the map shows", () => {
    mocks.cityInView = "Lisbon";
    bar(1);
    fireEvent.click(screen.getByRole("button", { name: "Plan a date" }));
    expect(mocks.plan).toHaveBeenCalledWith("date", "Lisbon");
  });

  it("asks for a city from the Library, whatever the map last showed", () => {
    mocks.cityInView = "Lisbon";
    bar(0);
    fireEvent.click(screen.getByRole("button", { name: "Plan a date" }));
    expect(mocks.plan).toHaveBeenCalledWith("date", undefined);
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

describe("height", () => {
  it("tells the screens under it how tall it is", () => {
    const onHeight = vi.fn();
    bar(0, false, onHeight);
    expect(onHeight).toHaveBeenCalledWith(112);
  });

  it("tells them it takes no room while the keyboard hides it on Android", () => {
    mocks.os = "android";
    mocks.keyboard = true;
    const onHeight = vi.fn();
    bar(0, false, onHeight);
    expect(onHeight).toHaveBeenCalledWith(0);
    expect(onHeight).not.toHaveBeenCalledWith(112);
  });
});
