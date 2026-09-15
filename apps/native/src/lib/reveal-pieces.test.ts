import { expect, it } from "vitest";
import type { FeedItem } from "@/components/item-card";
import type { Id } from "@convex/_generated/dataModel";
import { buildRevealPieces, searchWordFor } from "@/lib/reveal-pieces";

function demoItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    _id: "demo-item" as Id<"items">,
    type: "link",
    status: "ready",
    title: "Classic lasagne",
    url: "https://www.bbcgoodfood.com/recipes/classic-lasagne",
    siteName: "BBC Good Food",
    tags: ["pasta", "dinner"],
    ...overrides,
  };
}

it("stages the hero image, title, every tag, then the chosen space", () => {
  expect(
    buildRevealPieces(
      demoItem({ heroImageUrl: "https://img.example/lasagne.jpg" }),
      ["Recipes"],
    ),
  ).toEqual([
    { kind: "image" },
    { kind: "title" },
    { kind: "tag", tag: "pasta" },
    { kind: "tag", tag: "dinner" },
    { kind: "space", name: "Recipes" },
  ]);
});

it("omits the image piece when the save has no picture", () => {
  expect(buildRevealPieces(demoItem({ imageUrl: null }), ["Recipes"])).toEqual([
    { kind: "title" },
    { kind: "tag", tag: "pasta" },
    { kind: "tag", tag: "dinner" },
    { kind: "space", name: "Recipes" },
  ]);
});

it("uses a stored upload as the image when there is no hero", () => {
  expect(
    buildRevealPieces(
      demoItem({ type: "image", tags: [], imageUrl: "https://img/a.png" }),
      [],
    ),
  ).toEqual([{ kind: "image" }, { kind: "title" }, { kind: "inbox" }]);
});

it("ends on the shelf when the save went into no space", () => {
  expect(buildRevealPieces(demoItem(), [])).toEqual([
    { kind: "title" },
    { kind: "tag", tag: "pasta" },
    { kind: "tag", tag: "dinner" },
    { kind: "inbox" },
  ]);
});

it("still stages a title and a destination with zero tags", () => {
  expect(buildRevealPieces(demoItem({ tags: [] }), ["Read later"])).toEqual([
    { kind: "title" },
    { kind: "space", name: "Read later" },
  ]);
});

it("files into the first saved space when the server reports several", () => {
  expect(
    buildRevealPieces(demoItem({ tags: [] }), ["Recipes", "Dinner"]),
  ).toEqual([{ kind: "title" }, { kind: "space", name: "Recipes" }]);
});

it("searches the longest word of four or more letters, lowercased", () => {
  expect(searchWordFor("The Best Classic Lasagne")).toBe("classic");
});

it("keeps the first of two equally long words", () => {
  expect(searchWordFor("Pasta Sauce")).toBe("pasta");
});

it("splits words on digits and punctuation", () => {
  expect(searchWordFor("AirPods Pro 2 (USB-C)")).toBe("airpods");
});

it("reads non-Latin titles as letters too", () => {
  expect(searchWordFor("Классическая лазанья")).toBe("классическая");
});

it("has no word when nothing reaches four letters", () => {
  expect(searchWordFor("A cup of tea")).toBeNull();
  expect(searchWordFor("2026")).toBeNull();
  expect(searchWordFor("")).toBeNull();
  expect(searchWordFor(undefined)).toBeNull();
});
