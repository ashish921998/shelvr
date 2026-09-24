// @vitest-environment jsdom
// Tests for the deck-level animation coordination. Reanimated's SharedValue
// is stubbed with a plain get/set holder, so the provider's contract is what
// is under test: values seeded from the stack, one instance per deck, and a
// loud failure when a card hook runs without the provider.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeckAnimationProvider, useDeckAnimation } from "./deck-animation";

const shared = vi.hoisted(() => ({
  // Minimal SharedValue stand-in; the real one lives on the UI thread.
  make: (initial: unknown) => ({
    value: initial,
    get() {
      return this.value;
    },
    set(next: unknown) {
      this.value = next;
    },
  }),
}));
vi.mock("react-native-reanimated", () => ({
  useSharedValue: (initial: unknown) => shared.make(initial),
}));

type Deck = ReturnType<typeof useDeckAnimation>;

function Probe({ sink }: { sink: Deck[] }) {
  sink.push(useDeckAnimation());
  return null;
}

describe("DeckAnimationProvider", () => {
  it("seeds every value from the top card index", () => {
    const sink: Deck[] = [];
    render(
      <DeckAnimationProvider lastIndex={2}>
        <Probe sink={sink} />
      </DeckAnimationProvider>,
    );
    expect(sink[0].isDragging.value).toBe(false);
    expect(sink[0].animatedIndex.value).toBe(2);
    expect(sink[0].currentIndex.value).toBe(2);
    expect(sink[0].undoIndex.value).toBeNull();
  });

  it("throws when a card uses the hook outside the provider", () => {
    expect(() => render(<Probe sink={[]} />)).toThrow(
      "useDeckAnimation must be used within a DeckAnimationProvider",
    );
  });

  it("hands every consumer in one deck the same values", () => {
    const first: Deck[] = [];
    const second: Deck[] = [];
    render(
      <DeckAnimationProvider lastIndex={1}>
        <Probe sink={first} />
        <Probe sink={second} />
      </DeckAnimationProvider>,
    );
    expect(first[0]).toBe(second[0]);
  });

  it("mutates values in place", () => {
    const sink: Deck[] = [];
    render(
      <DeckAnimationProvider lastIndex={1}>
        <Probe sink={sink} />
      </DeckAnimationProvider>,
    );
    sink[0].currentIndex.set(0);
    expect(sink[0].currentIndex.get()).toBe(0);
  });
});
