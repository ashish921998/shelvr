// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { INTERESTS, type Interest } from "@/lib/onboarding-interests";
import { onboardingLabel } from "@/lib/onboarding-labels";
import type { SampleCityId } from "@/lib/sample-cities";
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
  menu: ({
    label,
    actions,
    children,
  }: Children & {
    label: string;
    actions: {
      id: string;
      label: string;
      selected?: boolean;
      onPress: () => void;
    }[];
  }) => (
    <div aria-label={label}>
      {children}
      <ul data-testid="city-menu">
        {actions.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              data-selected={String(Boolean(action.selected))}
              onClick={action.onPress}
            >
              {action.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  ),
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
vi.mock("@/components/ui/action-menu", () => ({ ActionMenu: mock.menu }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));
vi.mock("@/components/onboarding/parts", () => ({ CtaButton: mock.button }));

const SPOTS_TITLE = "interests.vibesTitle";
const chip = (id: string, checked?: boolean) =>
  screen.getByRole("checkbox", { name: onboardingLabel(id), checked });

function renderStep(
  picked: Interest[] = [],
  vibes: TravelVibe[] = [],
  city: SampleCityId | null = null,
) {
  const onToggle = vi.fn();
  const onToggleVibe = vi.fn();
  const onPickCity = vi.fn();
  render(
    <InterestsStep
      picked={picked}
      vibes={vibes}
      onToggle={onToggle}
      onToggleVibe={onToggleVibe}
      city={city}
      onPickCity={onPickCity}
      onAdvance={vi.fn()}
    />,
  );
  return { onToggle, onToggleVibe, onPickCity };
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

  it("asks where you are going next only once Travel is picked", () => {
    renderStep(["AI & tech"]);
    expect(screen.queryByText("interests.cityTitle")).toBeNull();
    renderStep(["Travel"]);
    expect(screen.getByText("interests.cityTitle")).toBeTruthy();
  });

  it("offers not sure first, then every city, and shows not sure while none is picked", () => {
    renderStep(["Travel"]);
    const options = Array.from(
      screen.getByTestId("city-menu").querySelectorAll("button"),
    );
    expect(options).toHaveLength(12);
    expect(options[0]?.textContent).toBe("interests.cityNotSure");
    expect(options[0]?.dataset.selected).toBe("true");
    expect(
      screen.getByLabelText("interests.cityTitle interests.cityNotSure"),
    ).toBeTruthy();
  });

  it("hands a picked city back and checks the current one", () => {
    const { onPickCity } = renderStep(["Travel"], [], "tokyo");
    expect(
      screen.getByLabelText("interests.cityTitle tripTeaser.cityTokyo"),
    ).toBeTruthy();
    const menu = screen.getByTestId("city-menu");
    const option = (name: string) =>
      Array.from(menu.querySelectorAll("button")).find(
        (button) => button.textContent === name,
      );
    expect(option("tripTeaser.cityTokyo")?.dataset.selected).toBe("true");
    option("tripTeaser.cityLisbon")?.click();
    expect(onPickCity).toHaveBeenCalledExactlyOnceWith("lisbon");
    option("interests.cityNotSure")?.click();
    expect(onPickCity).toHaveBeenLastCalledWith(null);
  });
});
