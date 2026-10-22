// @vitest-environment jsdom
// The promise step: a headline and three habits worded for the person's goal,
// and one button that hands over to the paywall.
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PromiseStep } from "./promise";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  button: ({
    label,
    onPress,
    busy,
  }: {
    label: string;
    onPress: () => void;
    busy?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={busy}>
      {label}
    </button>
  ),
}));

vi.mock("react-native", () => ({ View: mock.view, Text: mock.text }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { primaryText: "#000" } } }),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: { city?: string }) =>
    values?.city === undefined ? key : `${key} ${values.city}`,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));
vi.mock("@/components/onboarding/parts", () => ({ CtaButton: mock.button }));

describe("PromiseStep", () => {
  it.each([
    ["travel", "promise.travelTitle Lisbon", "promise.travelSave Lisbon"],
    ["food", "promise.noMore", "promise.foodSave Lisbon"],
    ["date", "promise.noMore", "promise.dateSave"],
    ["recipes", "promise.noMore", "promise.recipesSave"],
    ["other", "promise.noMore", "promise.otherSave"],
  ] as const)("words the %s promise for that goal", (goal, title, first) => {
    render(
      <PromiseStep
        goal={goal}
        city="Lisbon"
        leaving={false}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText(title, { exact: false })).toBeTruthy();
    expect(screen.getByText(first)).toBeTruthy();
  });

  it.each([
    ["travel", "promise.travelSaveAnywhere"],
    ["food", "promise.foodSaveAnywhere"],
  ] as const)("names no city for %s when none was picked", (goal, line) => {
    render(
      <PromiseStep
        goal={goal}
        city={null}
        leaving={false}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText(line)).toBeTruthy();
  });

  it.each([
    ["walk", "promise.datePickWalk"],
    ["drinks", "promise.datePickDrinks"],
    ["dessert", "promise.datePickDessert"],
  ] as const)("plans the date night with %s after dinner", (after, line) => {
    render(
      <PromiseStep
        goal="date"
        city="Lisbon"
        after={after}
        leaving={false}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText(line)).toBeTruthy();
  });

  it("commits with one tap", () => {
    const onCommit = vi.fn();
    render(
      <PromiseStep
        goal="other"
        city="Lisbon"
        leaving={false}
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByText("promise.cta"));
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("takes no taps while the paywall is on its way", () => {
    const onCommit = vi.fn();
    render(
      <PromiseStep goal="other" city="Lisbon" leaving onCommit={onCommit} />,
    );
    fireEvent.click(screen.getByText("promise.cta"));
    expect(onCommit).not.toHaveBeenCalled();
  });
});
