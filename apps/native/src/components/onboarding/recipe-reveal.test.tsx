// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RecipeRevealStep } from "./recipe-reveal";

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
  recipe: vi.fn(
    ({ recipe }: { recipe: { ingredients: string[]; steps: string[] } }) => (
      <ul>
        {[...recipe.ingredients, ...recipe.steps].map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ),
  ),
}));

vi.mock("react-native", () => ({
  View: mock.view,
  Text: mock.text,
  ScrollView: mock.view,
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: mock.view },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { primaryText: "#000" } } }),
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/recipe-section", () => ({ RecipeSection: mock.recipe }));
vi.mock("@/components/onboarding/parts", () => ({ CtaButton: mock.button }));
vi.mock("@/components/onboarding/trip-teaser", () => ({
  Head: vi.fn(({ title, accent }: { title: string; accent: string }) => (
    <h1>{`${title} ${accent}`}</h1>
  )),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/motion", () => ({ settleIn: () => undefined }));
vi.mock("@/lib/color", () => ({ withAlpha: () => "transparent" }));
vi.mock("../../../assets/onboarding/demo-recipe.jpg", () => ({ default: 1 }));

describe("RecipeRevealStep", () => {
  it("shows the sample recipe in the saved-recipe view", () => {
    render(<RecipeRevealStep onContinue={vi.fn()} />);
    expect(screen.getByText("recipeReveal.name")).toBeTruthy();
    expect(screen.getByText("recipeReveal.fromVideo")).toBeTruthy();
    expect(mock.recipe.mock.lastCall?.[0].recipe).toMatchObject({
      servings: "6",
      ingredients: expect.arrayContaining(["recipeReveal.ingredientMince"]),
      steps: expect.arrayContaining(["recipeReveal.stepBake"]),
    });
  });

  it("moves on once, however often Continue is tapped", () => {
    const onContinue = vi.fn();
    render(<RecipeRevealStep onContinue={onContinue} />);
    const next = screen.getByRole("button", { name: "common.continue" });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
