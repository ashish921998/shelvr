// @vitest-environment jsdom
// Tests for the per-card pan gesture commit logic. The gesture handler and
// animation drivers are stubbed, so the tests drive the recorded onBegin /
// onChange / onEnd callbacks directly and assert the commit contract: the
// dominant axis wins, a committed fling walks the deck index and schedules
// the decision on the JS thread, and anything less springs back.
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as Haptics from "expo-haptics";
import { CardAnimationProvider, useCardAnimation } from "./card-animation";
import { DeckAnimationProvider, useDeckAnimation } from "./deck-animation";

const gesture = vi.hoisted(() => ({
  handlers: {} as Record<string, (e: unknown) => unknown>,
}));
const worklets = vi.hoisted(() => ({
  scheduled: [] as [unknown, ...unknown[]][],
}));
const shared = vi.hoisted(() => ({
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

vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 400, height: 800 }),
}));
vi.mock("react-native-reanimated", () => ({
  useSharedValue: (initial: unknown) => shared.make(initial),
  withSpring: (value: number) => ({ driver: "spring", value }),
  withTiming: (value: number) => ({ driver: "timing", value }),
}));
vi.mock("react-native-gesture-handler", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- key mirrors the SDK export it stubs
  GestureDetector: (props: { children: unknown }) => props.children,
  Gesture: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- key mirrors the SDK export it stubs
    Pan: () => {
      const g: Record<string, unknown> = {};
      for (const name of ["onBegin", "onChange", "onEnd"]) {
        g[name] = (fn: (e: unknown) => unknown) => {
          gesture.handlers[name] = fn;
          return g;
        };
      }
      return g;
    },
  },
}));
vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: unknown, ...args: unknown[]) => {
    worklets.scheduled.push([fn, ...args]);
  },
}));
vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));
vi.mock("./use-single-haptic-on-pan", () => ({
  useSingleHapticOnPan: () => ({ singleHapticOnChange: vi.fn() }),
}));

type Card = ReturnType<typeof useCardAnimation>;
type Deck = ReturnType<typeof useDeckAnimation>;

function Probe({ cardSink, deckSink }: { cardSink: Card[]; deckSink: Deck[] }) {
  cardSink.push(useCardAnimation());
  deckSink.push(useDeckAnimation());
  return null;
}

function fire(name: string, event: unknown) {
  const handler = gesture.handlers[name];
  expect(handler, `${name} handler was registered`).toBeTruthy();
  return handler(event);
}

function flushDecision() {
  const entry = worklets.scheduled.at(-1);
  expect(entry, "a decision was scheduled on the JS thread").toBeTruthy();
  const [fn, action] = entry as [(...a: unknown[]) => void, string];
  fn(action);
  return action;
}

// Render one card of the given index; returns the probes and onDecision spy.
function setup(index: number) {
  const cardSink: Card[] = [];
  const deckSink: Deck[] = [];
  const onDecision = vi.fn();
  render(
    <DeckAnimationProvider lastIndex={1}>
      <CardAnimationProvider index={index} onDecision={onDecision}>
        <Probe cardSink={cardSink} deckSink={deckSink} />
      </CardAnimationProvider>
    </DeckAnimationProvider>,
  );
  return { card: cardSink[0], deck: deckSink[0], onDecision };
}

beforeEach(() => {
  gesture.handlers = {};
  worklets.scheduled = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("CardAnimationProvider", () => {
  it("derives the commit thresholds from the window", () => {
    const { card } = setup(0);
    // Quarter of the width and a fifth of the height.
    expect(card.panDistanceX).toBe(100);
    expect(card.panDistanceY).toBe(160);
    expect(card.panX.value).toBe(0);
    expect(card.panY.value).toBe(0);
  });

  it("marks dragging and records the grab point on begin", () => {
    const { card, deck } = setup(0);
    fire("onBegin", { absoluteY: 437 });
    expect(deck.isDragging.value).toBe(true);
    expect(card.absoluteYAnchor.value).toBe(437);
  });

  it("advances animatedIndex by the dominant-axis shift while dragging", () => {
    const { card, deck } = setup(0);
    // 250px right of a 100px threshold = one full card of shift.
    fire("onChange", { translationX: 250, translationY: 0 });
    expect(deck.animatedIndex.value).toBe(0);
    expect(card.panX.value).toBe(250);
  });

  it("never advances a downward drag", () => {
    const { deck } = setup(0);
    fire("onChange", { translationX: 0, translationY: 400 });
    expect(deck.animatedIndex.value).toBe(1);
  });

  it("commits a right fling as keep", () => {
    vi.stubEnv("EXPO_OS", "ios");
    const { card, deck, onDecision } = setup(0);
    fire("onEnd", { translationX: 250, translationY: 0 });
    expect(deck.currentIndex.value).toBe(0);
    expect(deck.prevIndex.value).toBe(1);
    expect(card.panX.value).toEqual({ driver: "timing", value: 500 });
    expect(flushDecision()).toBe("keep");
    expect(onDecision).toHaveBeenCalledWith(0, "keep");
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it("commits a left fling as delete", () => {
    const { card, onDecision } = setup(0);
    fire("onEnd", { translationX: -250, translationY: 0 });
    expect(card.panX.value).toEqual({ driver: "timing", value: -500 });
    expect(flushDecision()).toBe("delete");
    expect(onDecision).toHaveBeenCalledWith(0, "delete");
  });

  it("commits an upward fling as save", () => {
    const { card, onDecision } = setup(0);
    fire("onEnd", { translationX: 0, translationY: -200 });
    // 115% of the screen height, off the top.
    expect(card.panY.value).toEqual({ driver: "timing", value: -800 * 1.15 });
    expect(flushDecision()).toBe("save");
    expect(onDecision).toHaveBeenCalledWith(0, "save");
  });

  it("springs back without deciding when the fling is short", () => {
    vi.stubEnv("EXPO_OS", "ios");
    const { card, deck, onDecision } = setup(0);
    fire("onEnd", { translationX: 30, translationY: 10 });
    expect(card.panX.value).toEqual({ driver: "spring", value: 0 });
    expect(card.panY.value).toEqual({ driver: "spring", value: 0 });
    expect(deck.animatedIndex.value).toEqual({ driver: "timing", value: 1 });
    expect(deck.currentIndex.value).toBe(1);
    expect(onDecision).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(worklets.scheduled).toHaveLength(0);
  });
});
