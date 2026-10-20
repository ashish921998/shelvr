// @vitest-environment jsdom
// The interests step: topics as checkboxes and, once Travel is picked, one
// card more asking what kind of spots. Every pick is handed back to the
// screen, which keeps topics and spots alike as spaces.
import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  INTERESTS,
  isInterest,
  type Interest,
} from "@/lib/onboarding-interests";
import { onboardingLabel } from "@/lib/onboarding-labels";
import {
  TRAVEL_VIBES,
  isTravelVibe,
  spacesAfterInterestToggle,
  type TravelVibe,
} from "@/lib/travel-vibes";
import { InterestsStep } from "./interests";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  pressable: ({
    children,
    onPress,
    accessibilityRole,
    accessibilityState,
  }: Children & {
    onPress: () => void;
    accessibilityRole?: string;
    accessibilityState?: { checked?: boolean };
  }) => (
    <button
      type="button"
      role={accessibilityRole}
      aria-checked={accessibilityState?.checked}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
  empty: () => null,
}));

vi.mock("react-native", () => ({
  View: mock.view,
  Text: mock.text,
  Pressable: mock.pressable,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { primary: "#000" } } }),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: mock.empty }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));
vi.mock("@/components/onboarding/parts", () => ({ CtaButton: mock.button }));

// With t() returning its key, every label is its catalog key.
const SPOTS_TITLE = "interests.vibesTitle";
const chip = (id: string, checked?: boolean) =>
  screen.getByRole("checkbox", { name: onboardingLabel(id), checked });

function renderStep(picked: Interest[] = [], vibes: TravelVibe[] = []) {
  const onToggle = vi.fn();
  const onToggleVibe = vi.fn();
  render(
    <InterestsStep
      picked={picked}
      vibes={vibes}
      onToggle={onToggle}
      onToggleVibe={onToggleVibe}
      onAdvance={vi.fn()}
    />,
  );
  return { onToggle, onToggleVibe };
}

describe("InterestsStep", () => {
  it("asks nothing more while Travel is not picked", () => {
    renderStep(["Coffee"]);
    expect(screen.queryByText(SPOTS_TITLE)).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(INTERESTS.length);
    expect(chip("Coffee", true)).toBeTruthy();
  });

  it("asks what kind of spots once Travel is picked", () => {
    renderStep(["Travel"]);
    expect(screen.getByText(SPOTS_TITLE)).toBeTruthy();
    for (const vibe of TRAVEL_VIBES) expect(chip(vibe, false)).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(
      INTERESTS.length + TRAVEL_VIBES.length,
    );
    // The card's eyebrow names the topic it follows, under the Travel chip.
    expect(screen.getAllByText(onboardingLabel("Travel"))).toHaveLength(2);
  });

  it("hands a tapped spot back and shows a picked one checked", () => {
    const { onToggle, onToggleVibe } = renderStep(["Travel"], ["Hidden gems"]);
    expect(chip("Hidden gems", true)).toBeTruthy();
    fireEvent.click(chip("Good food", false));
    expect(onToggleVibe).toHaveBeenCalledExactlyOnceWith("Good food");
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("hands a tapped topic back, Travel included", () => {
    const { onToggle, onToggleVibe } = renderStep(["Travel"]);
    fireEvent.click(chip("Travel", true));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("Travel");
    expect(onToggleVibe).not.toHaveBeenCalled();
  });
});

// The screen's wiring: topics and spots are one list of spaces, topics toggle
// through spacesAfterInterestToggle and spots toggle on their own.
function Picker({ onChange }: { onChange: (spaces: string[]) => void }) {
  const [spaces, setSpaces] = useState<string[]>([]);
  const update = (next: (current: string[]) => string[]) =>
    setSpaces((current) => {
      const result = next(current);
      onChange(result);
      return result;
    });
  return (
    <InterestsStep
      picked={spaces.filter(isInterest)}
      vibes={spaces.filter(isTravelVibe)}
      onToggle={(interest) =>
        update((current) => spacesAfterInterestToggle(current, interest))
      }
      onToggleVibe={(vibe) =>
        update((current) =>
          current.includes(vibe)
            ? current.filter((name) => name !== vibe)
            : [...current, vibe],
        )
      }
      onAdvance={vi.fn()}
    />
  );
}

describe("InterestsStep with the screen's spaces", () => {
  it("keeps a spot as a space until Travel is unpicked, then forgets it", () => {
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    expect(screen.queryByText(SPOTS_TITLE)).toBeNull();

    fireEvent.click(chip("Travel", false));
    fireEvent.click(chip("Good food", false));
    expect(onChange).toHaveBeenLastCalledWith(["Travel", "Good food"]);
    expect(chip("Good food", true)).toBeTruthy();

    // A second spot, then the first unpicked again: only its own space moves.
    fireEvent.click(chip("Going out", false));
    fireEvent.click(chip("Good food", true));
    expect(onChange).toHaveBeenLastCalledWith(["Travel", "Going out"]);

    fireEvent.click(chip("Travel", true));
    expect(screen.queryByText(SPOTS_TITLE)).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith([]);

    // Picked again, Travel starts the card over.
    fireEvent.click(chip("Travel", false));
    expect(chip("Going out", false)).toBeTruthy();
  });
});
