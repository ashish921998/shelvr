// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanCitySheet } from "./plan-city-sheet";

vi.mock("@/lib/i18n", () => ({
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  useAppLocale: vi.fn(),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), hairlineWidth: 1 },
  useUnistyles: () => ({ theme: { opacity: { pressed: 0.7 } } }),
}));
vi.mock("@/components/ui/prompt-sheet", () => ({
  PromptSheet: vi.fn(
    ({
      visible,
      title,
      children,
      actions,
    }: {
      visible: boolean;
      title: string;
      children: ReactNode;
      actions: ReactNode;
    }) =>
      visible ? (
        <div>
          <h1>{title}</h1>
          {children}
          {actions}
        </div>
      ) : null,
  ),
}));
vi.mock("@/components/onboarding/parts", () => {
  const button = vi.fn(
    ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button onClick={onPress}>{label}</button>
    ),
  );
  return { CtaButton: button, GhostButton: button };
});
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      onPress,
      accessibilityLabel,
      accessibilityState,
      children,
    }: {
      onPress: () => void;
      accessibilityLabel: string;
      accessibilityState: { checked: boolean };
      children: ReactNode;
    }) => (
      <button
        role="radio"
        aria-label={accessibilityLabel}
        aria-checked={accessibilityState.checked}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));

const cities = [
  { name: "Mumbai", count: 9 },
  { name: "Goa", count: 5 },
];

function renderSheet(visible = true) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(
    <PlanCitySheet
      visible={visible}
      cities={cities}
      total={14}
      onClose={onClose}
      onPick={onPick}
    />,
  );
  return { onPick, onClose };
}

const checked = () =>
  screen.getAllByRole("radio").map((row) => row.getAttribute("aria-checked"));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PlanCitySheet", () => {
  it("lists the cities most first, then Anywhere, with the top one picked", () => {
    renderSheet();
    const rows = screen.getAllByRole("radio");
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      'Mumbai, plan.placeCount:{"count":9}',
      'Goa, plan.placeCount:{"count":5}',
      'plan.anywhere, plan.placeCount:{"count":14}',
    ]);
    expect(checked()).toEqual(["true", "false", "false"]);
  });

  it("makes the plan in the picked city", () => {
    const { onPick } = renderSheet();
    fireEvent.click(screen.getAllByRole("radio")[1]!);
    expect(checked()).toEqual(["false", "true", "false"]);
    fireEvent.click(screen.getByText("plan.make"));
    expect(onPick).toHaveBeenCalledWith("Goa");
  });

  it("sends no city for Anywhere", () => {
    const { onPick } = renderSheet();
    fireEvent.click(screen.getAllByRole("radio")[2]!);
    fireEvent.click(screen.getByText("plan.make"));
    expect(onPick).toHaveBeenCalledWith(undefined);
  });

  it("closes on Not now without a pick", () => {
    const { onPick, onClose } = renderSheet();
    fireEvent.click(screen.getByText("common.notNow"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("renders nothing while hidden", () => {
    renderSheet(false);
    expect(screen.queryByRole("radio")).toBeNull();
  });
});
