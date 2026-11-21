// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { AddSpotsSheet } from "@/components/add-spots/add-spots-sheet";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  canGoBack: true,
  plan: vi.fn(),
  loading: false,
  siri: [] as unknown[],
  admit: vi.fn(async () => "go"),
  passed: vi.fn(),
}));

vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <h2>{children}</h2>
  )),
}));
vi.mock("@/lib/pro-gate", () => ({
  useProGate: () => ({
    admit: mocks.admit,
    passed: mocks.passed,
    loading: mocks.loading,
  }),
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
    canGoBack: () => mocks.canGoBack,
    back: () => mocks.calls.push("back"),
    replace: (href: string) => mocks.calls.push(`replace ${href}`),
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

beforeEach(() => {
  mocks.calls = [];
  mocks.canGoBack = true;
  mocks.plan.mockReset();
  mocks.admit.mockClear();
  mocks.passed.mockClear();
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
  expect(mocks.admit).toHaveBeenCalledTimes(1);
  expect(mocks.passed).toHaveBeenCalledTimes(1);
  expect(mocks.calls).toEqual(["back", "/add"]);
});

it("keeps the sheet open under the paywall when the save check stops the save", async () => {
  mocks.admit.mockImplementationOnce(async () => "paywalled");
  press(/^Paste a link/);
  await Promise.resolve();
  expect(mocks.admit).toHaveBeenCalledTimes(1);
  expect(mocks.passed).not.toHaveBeenCalled();
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
  expect(mocks.admit).not.toHaveBeenCalled();
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

it("goes Home from the X when a link opened the sheet with nothing beneath it", () => {
  mocks.canGoBack = false;
  press("Close");
  expect(mocks.calls).toEqual(["replace /(app)/(tabs)/(home)"]);
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
