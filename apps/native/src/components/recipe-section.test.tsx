// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RecipeSection } from "./recipe-section";

vi.mock("@/lib/i18n", () => ({
  useAppLocale: () => {},
  t: (key: string, params?: { count?: number; number?: number }) =>
    params ? `${key}:${params.count ?? params.number}` : key,
}));
vi.mock("@/lib/appearance", () => ({
  isDarkThemeName: (name: string) => name !== "light",
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: { colors: { primarySoft: "#f7e8cd" } },
    rt: { themeName: "light" },
  }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  )),
}));
vi.mock("@expo/ui/community/segmented-control", () => ({
  SegmentedControl: vi.fn(
    ({
      values,
      selectedIndex,
      onChange,
    }: {
      values: string[];
      selectedIndex: number;
      onChange: (event: {
        nativeEvent: { selectedSegmentIndex: number; value: string };
      }) => void;
    }) => (
      <nav>
        {values.map((value, index) => (
          <button
            key={value}
            aria-pressed={index === selectedIndex}
            onClick={() =>
              onChange({ nativeEvent: { selectedSegmentIndex: index, value } })
            }
          >
            {value}
          </button>
        ))}
      </nav>
    ),
  ),
}));

function renderedText(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("p")).map((p) => p.textContent);
}

const PANCAKES = {
  name: "Pancakes",
  servings: "4 servings",
  ingredients: ["2 cups flour", "2 eggs"],
  steps: ["Whisk.", "Fry."],
};

it("opens on the ingredients tab with servings above the switch", () => {
  const { container, getByRole } = render(<RecipeSection recipe={PANCAKES} />);
  expect(renderedText(container)).toEqual([
    "4 servings",
    "2 cups flour",
    "2 eggs",
  ]);
  expect(
    getByRole("button", { name: "recipe.ingredients" }).getAttribute(
      "aria-pressed",
    ),
  ).toBe("true");
});

it("switches to directions with 1-based step labels in order, and back", () => {
  const { container, getByRole } = render(<RecipeSection recipe={PANCAKES} />);
  fireEvent.click(getByRole("button", { name: "recipe.steps" }));
  expect(renderedText(container)).toEqual([
    "4 servings",
    "recipe.stepNumber:1",
    "Whisk.",
    "recipe.stepNumber:2",
    "Fry.",
  ]);
  fireEvent.click(getByRole("button", { name: "recipe.ingredients" }));
  expect(renderedText(container)).toEqual([
    "4 servings",
    "2 cups flour",
    "2 eggs",
  ]);
});

it("omits the servings line when the recipe has none", () => {
  const { container } = render(
    <RecipeSection recipe={{ ingredients: ["Salt"], steps: ["Add salt."] }} />,
  );
  expect(renderedText(container)).toEqual(["Salt"]);
});

it("omits a placeholder yield the model wrote for a post that never stated one", () => {
  for (const servings of [
    "not specified",
    "Not specified.",
    "N/A",
    "unknown",
  ]) {
    const { container } = render(
      <RecipeSection
        recipe={{ servings, ingredients: ["Salt"], steps: ["Add salt."] }}
      />,
    );
    expect(renderedText(container)).toEqual(["Salt"]);
  }
});

it("phrases a bare numeric yield through the localized serves message but keeps phrases verbatim", () => {
  const numeric = render(
    <RecipeSection
      recipe={{ servings: "4", ingredients: ["Rice"], steps: ["Cook."] }}
    />,
  );
  expect(renderedText(numeric.container)[0]).toBe("recipe.serves:4");
  const phrase = render(
    <RecipeSection
      recipe={{
        servings: "Makes 16 cookies",
        ingredients: ["Rice"],
        steps: ["Cook."],
      }}
    />,
  );
  expect(renderedText(phrase.container)[0]).toBe("Makes 16 cookies");
});
