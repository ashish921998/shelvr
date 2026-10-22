// @vitest-environment jsdom
// The promise step: two habits that no earlier step already covered, and one
// button that hands over to the paywall.
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
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: { city?: string }) =>
    values?.city === undefined ? key : `${key} ${values.city}`,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));
vi.mock("@/components/onboarding/parts", () => ({ CtaButton: mock.button }));

describe("PromiseStep", () => {
  it("promises to come back to saves and use them", () => {
    render(
      <PromiseStep
        goal="other"
        city="Lisbon"
        leaving={false}
        onCommit={vi.fn()}
      />,
    );
    expect(screen.getByText("promise.comeBack")).toBeTruthy();
    expect(screen.getByText("promise.use")).toBeTruthy();
  });

  it.each([
    ["travel", "goal.promiseTravel"],
    ["food", "goal.promiseFood"],
    ["date", "goal.promiseDate"],
  ] as const)(
    "ties the second promise to the %s goal and city",
    (goal, line) => {
      render(
        <PromiseStep
          goal={goal}
          city="Lisbon"
          leaving={false}
          onCommit={vi.fn()}
        />,
      );
      expect(screen.getByText("promise.comeBack")).toBeTruthy();
      expect(screen.getByText(`${line} Lisbon`)).toBeTruthy();
      expect(screen.queryByText("promise.use")).toBeNull();
    },
  );

  it.each([
    ["food", "goal.promiseFoodAnywhere"],
    ["date", "goal.promiseDateAnywhere"],
  ] as const)(
    "names no city for %s when the sample only stands in for theirs",
    (goal, line) => {
      render(
        <PromiseStep
          goal={goal}
          city={null}
          leaving={false}
          onCommit={vi.fn()}
        />,
      );
      expect(screen.getByText(line)).toBeTruthy();
    },
  );

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
