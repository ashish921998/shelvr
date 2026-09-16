import { describe, expect, it } from "vitest";
import {
  isPresetSpace,
  spacesAfterKindToggle,
  type SaveKind,
} from "./save-kinds";

describe("spacesAfterKindToggle", () => {
  it.each<[string, SaveKind[], string[], SaveKind, string[]]>([
    [
      "seeds the defaults for the first pick",
      [],
      [],
      "Recipes",
      ["Recipes", "Read later"],
    ],
    [
      "adds the first preset of another pick",
      ["Recipes"],
      ["Recipes", "Read later"],
      "Travel",
      ["Recipes", "Read later", "Travel"],
    ],
    [
      "leaves spaces alone when the first preset is already picked",
      ["Recipes"],
      ["Read later", "Inspiration"],
      "Inspiration",
      ["Read later", "Inspiration"],
    ],
    [
      "drops every preset when the last kind is unpicked, keeping typed names",
      ["Recipes"],
      ["Recipes", "Restaurants to try", "Read later", "Book club"],
      "Recipes",
      ["Book club"],
    ],
    [
      "keeps presets another picked kind still offers",
      ["Articles", "Recipes"],
      ["Articles", "Read later", "Long reads", "Recipes", "Book club"],
      "Articles",
      ["Read later", "Recipes", "Book club"],
    ],
    [
      "keeps a preset that is both a kind preset and a generic one",
      ["Products", "Travel"],
      ["Wishlist", "Gift ideas", "Travel"],
      "Products",
      ["Wishlist", "Travel"],
    ],
  ])("%s", (_name, kinds, spaces, kind, expected) => {
    expect(spacesAfterKindToggle(kinds, spaces, kind)).toEqual(expected);
  });
});

describe("isPresetSpace", () => {
  it.each([
    ["Watch later", true],
    ["Read later", true],
    ["Home & decor", true],
    ["Products", false],
    ["Book club", false],
    ["recipes", false],
  ])("%s -> %s", (name, expected) => {
    expect(isPresetSpace(name)).toBe(expected);
  });
});
