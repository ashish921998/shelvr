// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { AddSpotsSheet } from "@/components/add-spots/add-spots-sheet";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  plan: vi.fn(),
  loading: false,
  siri: [] as unknown[],
  guard: vi.fn(async (action?: () => void) => {
    action?.();
    return true;
  }),
}));

vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  )),
}));
vi.mock("@/lib/free-plan", () => ({
  useSaveGuard: () => ({ guard: mocks.guard, loading: mocks.loading }),
}));
vi.mock("@/lib/plan-picker", () => ({
  usePlanPicker: () => ({ plan: mocks.plan, sheet: null }),
}));
vi.mock("@/lib/siri-phrases", () => ({
  useSiriShortcuts: () => mocks.siri,
}));
vi.mock("@/lib/map-city-in-view", () => ({
  useMapCityInView: () => undefined,
}));
vi.mock("@/lib/use-keyboard-visible", () => ({
  useKeyboardVisible: () => false,
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({
    back: () => mocks.calls.push("back"),
    push: (href: string) => mocks.calls.push(href),
  }),
}));
vi.mock("expo-router/js-tabs", async () => {
  const { createContext } = await import("react");
  return { BottomTabBarHeightCallbackContext: createContext(undefined) };
});
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    )),
  },
  useReducedMotion: () => false,
}));
vi.mock("@/lib/motion", () => ({ sheetIn: () => undefined }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFillObject: {} },
  useUnistyles: () => ({
    theme: { colors: { muted: "#6f6455" } },
    rt: { insets: { bottom: 34 } },
  }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      children?: ReactNode;
      onPress?: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) => (
      <button
        onClick={onPress}
        disabled={disabled}
        aria-label={accessibilityLabel}
      >
        {children}
      </button>
    ),
  ),
}));

beforeEach(() => {
  mocks.calls = [];
  mocks.plan.mockReset();
  mocks.guard.mockClear();
  mocks.loading = false;
  mocks.siri = [];
});

function press(name: string | RegExp) {
  render(<AddSpotsSheet />);
  fireEvent.click(screen.getByRole("button", { name }));
}

it("closes the sheet, then opens the link field after the save check", async () => {
  press(/^Paste a link/);
  await Promise.resolve();
  expect(mocks.guard).toHaveBeenCalledTimes(1);
  expect(mocks.calls).toEqual(["back", "/add"]);
});

it("keeps the sheet open under the paywall when the save check stops the save", async () => {
  mocks.guard.mockImplementationOnce(async () => false);
  press(/^Paste a link/);
  await Promise.resolve();
  expect(mocks.guard).toHaveBeenCalledTimes(1);
  expect(mocks.calls).toEqual([]);
});

it("takes a Google Maps list through the same link field", async () => {
  press("Google Maps list");
  await Promise.resolve();
  expect(mocks.calls).toEqual(["back", "/add"]);
});

it("waits while the save check is still loading", () => {
  mocks.loading = true;
  press(/^Paste a link/);
  expect(mocks.guard).not.toHaveBeenCalled();
  expect(mocks.calls).toEqual([]);
});

it("starts a shared list", () => {
  press("Start a shared list");
  expect(mocks.calls).toEqual(["back", "/new-shared-list"]);
});

it("plans a trip through the city picker", () => {
  press("Plan a trip");
  expect(mocks.plan).toHaveBeenCalledWith("trip");
});

it("closes from the X", () => {
  press("Close");
  expect(mocks.calls).toEqual(["back"]);
});

it("opens How to share after closing the sheet", () => {
  press("How to share");
  expect(mocks.calls).toEqual(["back", "/how-to-share"]);
});

it("opens Save with Siri where Siri has phrases for Shelvr", () => {
  mocks.siri = [{ intent: "SaveLinkIntent" }];
  press("Save with Siri");
  expect(mocks.calls).toEqual(["back", "/save-with-siri"]);
});

it("leaves Save with Siri out where Siri has no phrases for Shelvr", () => {
  render(<AddSpotsSheet />);
  expect(screen.queryByRole("button", { name: "Save with Siri" })).toBeNull();
  expect(screen.getByRole("button", { name: "How to share" })).toBeTruthy();
});
