// @vitest-environment jsdom
// Tests for the per-card pan gesture commit logic. The gesture handler and
// animation drivers are stubbed, so the tests drive the recorded onBegin /
// onChange / onEnd callbacks directly and assert the commit contract: the
// dominant projected axis wins (velocity included), a committed card rides a
// velocity-carrying spring off-screen, the deck index walks, the haptic latch
// commits once, and anything less springs back.
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cancelAnimation, withSpring } from "react-native-reanimated";
import { CardAnimationProvider, useCardAnimation } from "./card-animation";
import { DeckAnimationProvider, useDeckAnimation } from "./deck-animation";

const gesture = vi.hoisted(() => ({
  handlers: {} as Record<string, (e: unknown) => unknown>,
}));
const worklets = vi.hoisted(() => ({
  scheduled: [] as [unknown, ...unknown[]][],
}));
const haptics = vi.hoisted(() => ({
  change: vi.fn(),
  reset: vi.fn(),
  commit: vi.fn(),
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
  withSpring: vi.fn((value: number, _config?: unknown) => ({
    driver: "spring",
    value,
  })),
  withTiming: (value: number) => ({ driver: "timing", value }),
  cancelAnimation: vi.fn(),
}));
vi.mock("@/lib/motion", () => ({
  motion: { spring: { drag: {}, settle: {} }, timing: { fade: {} } },
}));
vi.mock("react-native-gesture-handler", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- key mirrors the SDK export it stubs
  GestureDetector: (props: { children: unknown }) => props.children,
  Gesture: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- key mirrors the SDK export it stubs
    Pan: () => {
      const g: Record<string, unknown> = {};
      for (const name of ["onBegin", "onChange", "onEnd", "onFinalize"]) {
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
vi.mock("./use-single-haptic-on-pan", () => ({
  useSingleHapticOnPan: () => ({
    singleHapticOnChange: haptics.change,
    resetHaptic: haptics.reset,
    commitHaptic: haptics.commit,
  }),
}));

type Card = ReturnType<typeof useCardAnimation>;
type Deck = ReturnType<typeof useDeckAnimation>;

function Probe({ cardSink, deckSink }: { cardSink: Card[]; deckSink: Deck[] }) {
  cardSink.push(useCardAnimation());
  deckSink.push(useDeckAnimation());
  return null;
}

function fire(name: string, ...args: unknown[]) {
  const handler = gesture.handlers[name];
  expect(handler, `${name} handler was registered`).toBeTruthy();
  // onFinalize is called with (event, success), so handlers take rest args.
  return (handler as (...handlerArgs: unknown[]) => unknown)(...args);
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

// A real pan always changes (onChange) before it ends, and onChange is what
// parks the full-travel offsets the commit decision reads.
function drag(translation: { x: number; y: number }) {
  fire("onChange", {
    translationX: translation.x,
    translationY: translation.y,
  });
  fire("onEnd", { velocityX: 0, velocityY: 0 }, true);
}

beforeEach(() => {
  gesture.handlers = {};
  worklets.scheduled = [];
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("marks dragging, records the grab point, and re-arms the haptic on begin", () => {
    const { card, deck } = setup(0);
    fire("onBegin", { absoluteY: 437 });
    expect(deck.isDragging.value).toBe(true);
    expect(card.absoluteYAnchor.value).toBe(437);
    expect(haptics.reset).toHaveBeenCalled();
  });

  it("advances animatedIndex by the dominant-axis shift while dragging", () => {
    const { card, deck } = setup(0);
    // 250px right of a 100px threshold = one full card of shift.
    fire("onChange", { translationX: 250, translationY: 0 });
    expect(deck.animatedIndex.value).toBe(0);
    expect(card.panX.value).toBe(250);
    // The haptic latch sees the same full-travel coordinates.
    expect(haptics.change).toHaveBeenCalledWith(250, 0);
  });

  it("never advances a downward drag", () => {
    const { deck } = setup(0);
    fire("onChange", { translationX: 0, translationY: 400 });
    expect(deck.animatedIndex.value).toBe(1);
  });

  it("does not shift the deck for a downward-dominant drag past the side threshold", () => {
    const { card, deck, onDecision } = setup(0);
    // 150px right clears the 100px side threshold, but 400px down dominates
    // the axis, so release will refuse: the reveal must not promise a commit.
    fire("onChange", { translationX: 150, translationY: 400 });
    expect(deck.animatedIndex.value).toBe(1);
    fire("onEnd", { velocityX: 0, velocityY: 0 }, true);
    expect(card.panX.value).toEqual({ driver: "spring", value: 0 });
    expect(deck.currentIndex.value).toBe(1);
    expect(onDecision).not.toHaveBeenCalled();
    expect(haptics.commit).not.toHaveBeenCalled();
    expect(worklets.scheduled).toHaveLength(0);
  });

  it("commits a right fling as keep on a velocity spring", () => {
    const { card, deck, onDecision } = setup(0);
    drag({ x: 250, y: 0 });
    expect(deck.currentIndex.value).toBe(0);
    // 125% of the screen width, off the right edge.
    expect(card.panX.value).toEqual({ driver: "spring", value: 500 });
    expect(card.panY.value).toEqual({ driver: "spring", value: 0 });
    expect(deck.animatedIndex.value).toEqual({ driver: "spring", value: 0 });
    expect(flushDecision()).toBe("keep");
    expect(onDecision).toHaveBeenCalledWith(0, "keep");
    expect(haptics.commit).toHaveBeenCalledTimes(1);
  });

  it("commits a left fling as delete", () => {
    const { card, onDecision } = setup(0);
    drag({ x: -250, y: 0 });
    expect(card.panX.value).toEqual({ driver: "spring", value: -500 });
    expect(flushDecision()).toBe("delete");
    expect(onDecision).toHaveBeenCalledWith(0, "delete");
  });

  it("commits an upward fling as save", () => {
    const { card, onDecision } = setup(0);
    drag({ x: 0, y: -200 });
    // 115% of the screen height, off the top.
    expect(card.panY.value).toEqual({ driver: "spring", value: -800 * 1.15 });
    expect(card.panX.value).toEqual({ driver: "spring", value: 0 });
    expect(flushDecision()).toBe("save");
    expect(onDecision).toHaveBeenCalledWith(0, "save");
  });

  it("springs back without deciding when the fling is short", () => {
    const { card, deck, onDecision } = setup(0);
    drag({ x: 30, y: 10 });
    expect(card.panX.value).toEqual({ driver: "spring", value: 0 });
    expect(card.panY.value).toEqual({ driver: "spring", value: 0 });
    expect(deck.animatedIndex.value).toEqual({ driver: "spring", value: 1 });
    expect(deck.currentIndex.value).toBe(1);
    expect(onDecision).not.toHaveBeenCalled();
    expect(haptics.commit).not.toHaveBeenCalled();
    expect(worklets.scheduled).toHaveLength(0);
  });

  it("commits a save on a diagonal where the vertical axis dominates", () => {
    const { onDecision } = setup(0);
    // Both axes cross their thresholds; the larger travel wins.
    drag({ x: 150, y: -400 });
    expect(flushDecision()).toBe("save");
    expect(onDecision).toHaveBeenCalledWith(0, "save");
  });

  it("commits a keep on a diagonal where the horizontal axis dominates", () => {
    const { onDecision } = setup(0);
    drag({ x: 250, y: -200 });
    expect(flushDecision()).toBe("keep");
    expect(onDecision).toHaveBeenCalledWith(0, "keep");
  });

  it("breaks an exact diagonal tie toward the horizontal axis", () => {
    const { onDecision } = setup(0);
    // The up-commit demands strictly more upward travel than horizontal;
    // the side commit accepts a tie, so a perfect diagonal deletes.
    drag({ x: -250, y: -400 });
    expect(flushDecision()).toBe("delete");
    expect(onDecision).toHaveBeenCalledWith(0, "delete");
  });

  it("springs back on a diagonal where neither axis crosses its threshold", () => {
    const { card, onDecision } = setup(0);
    drag({ x: 80, y: -120 });
    expect(card.panX.value).toEqual({ driver: "spring", value: 0 });
    expect(card.panY.value).toEqual({ driver: "spring", value: 0 });
    expect(onDecision).not.toHaveBeenCalled();
    expect(worklets.scheduled).toHaveLength(0);
  });

  it("commits a fast flick whose own translation is sub-threshold", () => {
    const { onDecision } = setup(0);
    // 30px of travel, but the projected momentum clears the threshold.
    fire("onChange", { translationX: 30, translationY: 0 });
    fire("onEnd", { velocityX: 2000, velocityY: 0 }, true);
    expect(flushDecision()).toBe("keep");
    expect(onDecision).toHaveBeenCalledWith(0, "keep");
    // The latch fires on commit even though the drag never crossed.
    expect(haptics.commit).toHaveBeenCalledTimes(1);
    expect(withSpring).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ velocity: -20, overshootClamping: true }),
    );
    expect(withSpring).toHaveBeenCalledWith(
      500,
      expect.objectContaining({ velocity: 2000, overshootClamping: true }),
    );
    expect(withSpring).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ velocity: 0, overshootClamping: true }),
    );
  });

  it("cancels in-flight animations and resumes from the card's offset on begin", () => {
    const { card, deck } = setup(0);
    // A card mid-settle, 120px out with some vertical drift.
    card.panX.value = 120;
    card.panY.value = 40;
    fire("onBegin", { absoluteY: 437 });
    expect(vi.mocked(cancelAnimation)).toHaveBeenCalledWith(card.panX);
    expect(vi.mocked(cancelAnimation)).toHaveBeenCalledWith(card.panY);
    expect(vi.mocked(cancelAnimation)).toHaveBeenCalledWith(deck.animatedIndex);
    // A 30px drag continues from 120px, and deck shift uses the full 150px
    // of travel (past the 100px threshold) rather than the grab-relative 30.
    fire("onChange", { translationX: 30, translationY: 0 });
    expect(card.panX.value).toBe(150);
    expect(card.panY.value).toBe(40);
    expect(deck.animatedIndex.value).toBe(0);
  });

  it("commits on release from a re-grab whose own translation is short", () => {
    const { card, onDecision } = setup(0);
    // A card mid-settle, 120px out; the re-grab's own translation is zero.
    card.panX.value = 120;
    fire("onBegin", { absoluteY: 400 });
    fire(
      "onEnd",
      {
        translationX: 0,
        translationY: 0,
        velocityX: 0,
        velocityY: 0,
      },
      true,
    );
    // The parked offset alone clears the threshold.
    expect(card.panX.value).toEqual({ driver: "spring", value: 500 });
    expect(flushDecision()).toBe("keep");
    expect(onDecision).toHaveBeenCalledWith(0, "keep");
  });

  it("returns a cancelled pan home without deciding", () => {
    const { card, deck, onDecision } = setup(0);
    fire("onBegin", { absoluteY: 400 });
    fire("onChange", { translationX: 250, translationY: 0 });
    // The OS stole the gesture: onEnd never runs, onFinalize reports failure.
    fire("onFinalize", { translationX: 250 }, false);
    expect(deck.isDragging.value).toBe(false);
    expect(card.panX.value).toEqual({ driver: "spring", value: 0 });
    expect(card.panY.value).toEqual({ driver: "spring", value: 0 });
    expect(deck.animatedIndex.value).toEqual({ driver: "spring", value: 1 });
    expect(onDecision).not.toHaveBeenCalled();
    expect(haptics.commit).not.toHaveBeenCalled();
    expect(worklets.scheduled).toHaveLength(0);
  });

  it("ignores a failed onEnd even when the travel would commit", () => {
    const { card, deck, onDecision } = setup(0);
    fire("onBegin", { absoluteY: 400 });
    fire("onChange", { translationX: 250, translationY: 0 });
    // RNGH reports a failed or cancelled pan through onEnd's success flag
    // too; the parked full-travel offset must not turn that into a decision.
    fire("onEnd", { velocityX: 0, velocityY: 0 }, false);
    expect(deck.isDragging.value).toBe(false);
    // No commit spring and no spring home either — recovery is onFinalize's.
    expect(card.panX.value).toBe(250);
    expect(deck.currentIndex.value).toBe(1);
    expect(onDecision).not.toHaveBeenCalled();
    expect(haptics.commit).not.toHaveBeenCalled();
    expect(worklets.scheduled).toHaveLength(0);
    // The full RNGH failure sequence chains onFinalize after the failed
    // onEnd; it is what returns the card home once the commit is refused.
    fire("onFinalize", { velocityX: 0, velocityY: 0 }, false);
    expect(card.panX.value).toEqual({ driver: "spring", value: 0 });
    expect(card.panY.value).toEqual({ driver: "spring", value: 0 });
    expect(deck.animatedIndex.value).toEqual({ driver: "spring", value: 1 });
    expect(onDecision).not.toHaveBeenCalled();
    expect(worklets.scheduled).toHaveLength(0);
  });

  it("leaves a committed fling untouched when finalize reports success", () => {
    const { card, deck } = setup(0);
    drag({ x: 250, y: 0 });
    fire("onFinalize", { velocityX: 0, velocityY: 0 }, true);
    expect(deck.isDragging.value).toBe(false);
    expect(card.panX.value).toEqual({ driver: "spring", value: 500 });
  });
});
