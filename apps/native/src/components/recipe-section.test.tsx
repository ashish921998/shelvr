// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RecipeSection } from "./recipe-section";

vi.mock("@/lib/i18n", () => ({
  useAppLocale: () => {},
  t: (key: string) => key,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  )),
}));

function renderedText(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("p")).map((p) => p.textContent);
}

it("renders servings, then ingredients, then 1-based numbered steps in order", () => {
  const { container } = render(
    <RecipeSection
      recipe={{
        name: "Pancakes",
        servings: "4 servings",
        ingredients: ["2 cups flour", "2 eggs"],
        steps: ["Whisk.", "Fry."],
      }}
    />,
  );
  // `name` is intentionally not rendered: the item title already carries it.
  expect(renderedText(container)).toEqual([
    "4 servings",
    "recipe.ingredients",
    "2 cups flour",
    "2 eggs",
    "recipe.steps",
    "1",
    "Whisk.",
    "2",
    "Fry.",
  ]);
});

it("omits the servings line when the recipe has none", () => {
  const { container } = render(
    <RecipeSection recipe={{ ingredients: ["Salt"], steps: ["Add salt."] }} />,
  );
  expect(renderedText(container)).toEqual([
    "recipe.ingredients",
    "Salt",
    "recipe.steps",
    "1",
    "Add salt.",
  ]);
});
