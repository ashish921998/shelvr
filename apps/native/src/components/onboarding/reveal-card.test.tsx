// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { FeedItem } from "@/components/item-card";
import type { Id } from "@convex/_generated/dataModel";
import { buildRevealPieces } from "@/lib/reveal-pieces";
import { RevealCard } from "./reveal-card";

vi.mock("expo-image", () => ({
  Image: vi.fn(({ source }: { source: { uri: string } }) => (
    <img alt="hero" src={source.uri} />
  )),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  StyleSheet: { flatten: (style: unknown) => style },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native-reanimated", async () => {
  const { View, Text } = await import("react-native");
  const builder = {
    duration: () => builder,
    delay: () => builder,
    easing: () => builder,
  };
  return {
    default: { View, Text },
    FadeIn: builder,
    FadeOut: builder,
    FadeInDown: builder,
    Easing: { bezier: () => undefined },
    cubicBezier: () => undefined,
    useReducedMotion: () => false,
  };
});

const ITEM: FeedItem = {
  _id: "demo-item" as Id<"items">,
  type: "link",
  status: "ready",
  title: "Classic lasagne",
  url: "https://www.bbcgoodfood.com/recipes/classic-lasagne",
  siteName: "BBC Good Food",
  heroImageUrl: "https://img.example/lasagne.jpg",
  tags: ["pasta", "dinner"],
};

const PIECES = buildRevealPieces(ITEM, ["Recipes"]);

function copy() {
  return screen.getByTestId("card").textContent;
}

function card(revealedCount: number, pieces = PIECES) {
  return (
    <div data-testid="card">
      <RevealCard item={ITEM} pieces={pieces} revealedCount={revealedCount} />
    </div>
  );
}

it("reveals the card one piece at a time as the count advances", () => {
  const { rerender } = render(card(0));
  expect(copy()).toBe("");
  expect(screen.queryByAltText("hero")).toBeNull();

  rerender(card(1));
  expect(screen.getByAltText("hero").getAttribute("src")).toBe(
    "https://img.example/lasagne.jpg",
  );
  expect(copy()).toBe("");

  rerender(card(2));
  expect(copy()).toBe("Classic lasagneBBC Good Food");

  rerender(card(3));
  expect(copy()).toContain("pasta");
  expect(copy()).not.toContain("dinner");

  rerender(card(4));
  expect(copy()).toContain("dinner");
  expect(copy()).not.toContain("Filed into");

  rerender(card(5));
  expect(copy()).toContain("Filed into Recipes");
});

it("ends on the shelf line when no space took the save", () => {
  const pieces = buildRevealPieces(ITEM, []);
  render(card(pieces.length, pieces));
  expect(copy()).toContain("On your shelf");
  expect(copy()).not.toContain("Filed into");
});
