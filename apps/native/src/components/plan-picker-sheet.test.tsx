// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PlanPickerSheet } from "./plan-picker-sheet";

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/prompt-sheet", () => ({
  PromptSheet: vi.fn(
    ({
      visible,
      title,
      children,
    }: {
      visible: boolean;
      title: string;
      children: ReactNode;
    }) =>
      visible ? (
        <div>
          <h2>{title}</h2>
          {children}
        </div>
      ) : null,
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      onPress,
      accessibilityLabel,
    }: {
      onPress: () => void;
      accessibilityLabel: string;
    }) => <button aria-label={accessibilityLabel} onClick={onPress} />,
  ),
}));

describe("PlanPickerSheet", () => {
  it("sends each choice to its own flow", () => {
    const onGoOut = vi.fn();
    const onTrip = vi.fn();
    render(
      <PlanPickerSheet
        visible
        onClose={vi.fn()}
        onGoOut={onGoOut}
        onTrip={onTrip}
      />,
    );

    expect(screen.getByText("plan.pickerTitle")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "plan.goOut. plan.goOutBody" }),
    );
    expect(onGoOut).toHaveBeenCalledOnce();
    expect(onTrip).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "trip.pickTitle. trip.pickBody" }),
    );
    expect(onTrip).toHaveBeenCalledOnce();
  });

  it("renders nothing while hidden", () => {
    render(
      <PlanPickerSheet
        visible={false}
        onClose={vi.fn()}
        onGoOut={vi.fn()}
        onTrip={vi.fn()}
      />,
    );
    expect(screen.queryByText("plan.pickerTitle")).toBeNull();
  });
});
