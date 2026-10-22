// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { INTERESTS, type Interest } from "@/lib/onboarding-interests";
import { onboardingLabel } from "@/lib/onboarding-labels";
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

const chip = (id: string, checked?: boolean) =>
  screen.getByRole("checkbox", { name: onboardingLabel(id), checked });

function renderStep(picked: Interest[] = []) {
  const onToggle = vi.fn();
  render(
    <InterestsStep picked={picked} onToggle={onToggle} onAdvance={vi.fn()} />,
  );
  return { onToggle };
}

describe("InterestsStep", () => {
  it("offers every topic but Travel, which is its own goal", () => {
    renderStep();
    expect(screen.getAllByRole("checkbox")).toHaveLength(INTERESTS.length - 1);
    expect(
      screen.queryByRole("checkbox", { name: onboardingLabel("Travel") }),
    ).toBeNull();
  });

  it("shows a picked topic checked and hands a tapped one back", () => {
    const { onToggle } = renderStep(["AI & tech"]);
    expect(chip("AI & tech", true)).toBeTruthy();
    fireEvent.click(chip("Home & design", false));
    expect(onToggle).toHaveBeenCalledExactlyOnceWith("Home & design");
  });

  it("keeps Continue out of the scrolling picks, so it stays on screen", () => {
    renderStep(["AI & tech"]);
    const picks = screen.getByTestId("picks");
    expect(picks.contains(chip("AI & tech"))).toBe(true);
    expect(picks.contains(screen.getByText("common.continue"))).toBe(false);
  });
});
