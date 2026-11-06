// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeenCitiesRow } from "./been-cities-row";

const mocks = vi.hoisted(() => ({
  gate: { gated: false, planUnknown: false },
  been: undefined as string[] | undefined,
  push: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("@/lib/plan-gate", () => ({ usePlanGate: () => mocks.gate }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: vi.fn() },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.been, error: null }),
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: vi.fn() }));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: () => vi.fn(),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({ theme: { colors: { muted: "gray" } } }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      accessibilityLabel,
      testID,
      onPress,
    }: {
      children?: ReactNode;
      accessibilityLabel: string;
      testID: string;
      onPress: () => void;
    }) => (
      <button
        aria-label={accessibilityLabel}
        data-testid={testID}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));

const row = () => screen.queryByTestId("profile-been-cities");

beforeEach(() => {
  mocks.gate = { gated: false, planUnknown: false };
  mocks.been = undefined;
  mocks.push.mockClear();
  mocks.capture.mockClear();
});
afterEach(cleanup);

describe("BeenCitiesRow", () => {
  it("hides at the plan gate and while the plan is unknown", () => {
    mocks.been = ["lisbon"];
    mocks.gate = { gated: true, planUnknown: false };
    const view = render(<BeenCitiesRow />);
    expect(row()).toBeNull();
    mocks.gate = { gated: false, planUnknown: true };
    view.rerender(<BeenCitiesRow />);
    expect(row()).toBeNull();
    mocks.gate = { gated: false, planUnknown: false };
    view.rerender(<BeenCitiesRow />);
    expect(row()).not.toBeNull();
  });

  it("shows no count while loading, None yet at zero, and the plural after", () => {
    const view = render(<BeenCitiesRow />);
    expect(row()?.getAttribute("aria-label")).toBe("been.citiesTitle");
    expect(row()?.textContent).toBe("been.citiesTitle");
    mocks.been = [];
    view.rerender(<BeenCitiesRow />);
    expect(row()?.getAttribute("aria-label")).toBe(
      "been.citiesTitle, been.none",
    );
    mocks.been = ["lisbon", "madrid", "tokyo"];
    view.rerender(<BeenCitiesRow />);
    expect(row()?.getAttribute("aria-label")).toBe(
      'been.citiesTitle, been.cityCount {"count":3}',
    );
    expect(row()?.textContent).toContain('been.cityCount {"count":3}');
  });

  it("opens the editor and reports the count", () => {
    mocks.been = ["lisbon", "madrid", "tokyo"];
    render(<BeenCitiesRow />);
    fireEvent.click(row() as HTMLElement);
    expect(mocks.capture).toHaveBeenCalledWith("been_cities_editor_opened", {
      surface: "profile",
      count: 3,
    });
    expect(mocks.push).toHaveBeenCalledWith("/been-cities");
  });
});
