// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { GoalStep, SavedCountStep } from "./questions";

type Children = { children?: ReactNode };

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: Children) => <div>{children}</div>),
  ScrollView: vi.fn(({ children }: Children) => <div>{children}</div>),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("@/components/onboarding/parts", () => ({
  QuestionTitle: vi.fn(({ title }: { title: string }) => <h1>{title}</h1>),
  PillButton: vi.fn(
    ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" onClick={onPress} disabled={disabled}>
        {label}
      </button>
    ),
  ),
  OptionCard: vi.fn(
    ({
      title,
      selected,
      onPress,
    }: {
      title: string;
      selected: boolean;
      onPress: () => void;
    }) => (
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        onClick={onPress}
      >
        {title}
      </button>
    ),
  ),
}));

afterEach(cleanup);

const option = (name: string) => screen.getByRole("checkbox", { name });

it("waits for a goal, toggles goals, and picks all three with a bit of everything", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <GoalStep picked={[]} onChange={onChange} onContinue={vi.fn()} />,
  );
  const next = screen.getByRole("button", { name: "common.continue" });
  expect(next.hasAttribute("disabled")).toBe(true);

  fireEvent.click(option("onboardingQ.goalTravel"));
  expect(onChange).toHaveBeenLastCalledWith(["travel"]);
  fireEvent.click(option("onboardingQ.goalEverything"));
  expect(onChange).toHaveBeenLastCalledWith(["date", "travel", "food"]);

  rerender(
    <GoalStep
      picked={["date", "travel", "food"]}
      onChange={onChange}
      onContinue={vi.fn()}
    />,
  );
  expect(option("onboardingQ.goalEverything").ariaChecked).toBe("true");
  fireEvent.click(option("onboardingQ.goalDate"));
  expect(onChange).toHaveBeenLastCalledWith(["travel", "food"]);
  fireEvent.click(option("onboardingQ.goalEverything"));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

it("marks the one saved-count answer and moves on only after one", () => {
  const onPick = vi.fn();
  const onContinue = vi.fn();
  render(
    <SavedCountStep
      picked="hundreds"
      onPick={onPick}
      onContinue={onContinue}
    />,
  );
  expect(option("onboardingQ.savedHundreds").ariaChecked).toBe("true");
  expect(option("onboardingQ.savedFew").ariaChecked).toBe("false");
  fireEvent.click(option("onboardingQ.savedFew"));
  expect(onPick).toHaveBeenCalledWith("few");
  fireEvent.click(screen.getByRole("button", { name: "common.continue" }));
  expect(onContinue).toHaveBeenCalled();
});
