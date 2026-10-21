// @vitest-environment jsdom
// The interests step: topics as checkboxes and, once Travel is picked, one
// card more asking what kind of spots. Every pick is handed back to the
// screen, which keeps topics and spots alike as spaces; the screen's wiring
// is tested in src/lib/interests-screen.test.tsx.
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { INTERESTS, type Interest } from "@/lib/onboarding-interests";
import { onboardingLabel } from "@/lib/onboarding-labels";
import { TRAVEL_VIBES, type TravelVibe } from "@/lib/travel-vibes";
import { InterestsStep } from "./interests";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
  view: ({ children }: Children) => <div>{children}</div>,
  scroll: ({ children }: Children) => <div data-testid="picks">{children}</div>,
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
  ScrollView: mock.scroll,
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
    renderStep(["AI & tech"]);
    expect(screen.queryByText(SPOTS_TITLE)).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(INTERESTS.length);
    expect(chip("AI & tech", true)).toBeTruthy();
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

  it("keeps Continue out of the scrolling picks, so it stays on screen", () => {
    renderStep(["Travel"]);
    const picks = screen.getByTestId("picks");
    expect(picks.contains(chip("Travel"))).toBe(true);
    expect(picks.contains(chip("Good food"))).toBe(true);
    expect(picks.contains(screen.getByText("common.continue"))).toBe(false);
  });

  it("hands a tapped topic back, Travel included", () => {
    const { onToggle, onToggleVibe } = renderStep(["Travel"]);
    fireEvent.click(chip("Travel", true));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("Travel");
    expect(onToggleVibe).not.toHaveBeenCalled();
  });
});
