// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import type { ReactNode } from "react";

import { PlanDeck } from "@/components/plan-deck";
import { usePlanDeck, type PlanPlace } from "@/lib/make-plan";

type PanEnd = (
  event: { translationX: number; velocityX: number },
  success: boolean,
) => void;

const captured = vi.hoisted(() => ({
  onEnd: null as PanEnd | null,
  sharedValues: [] as { get(): number }[],
}));

// Reanimated: shared values are plain boxes that survive re-renders; a timed
// animation lands at once and reports completion on the next microtask, the
// way a finished animation would after the frame.
vi.mock("react-native-reanimated", async () => {
  const React = await import("react");
  function useSharedValue(initial: number) {
    const [box] = React.useState(() => {
      const created = {
        value: initial,
        get() {
          return created.value;
        },
        set(next: number) {
          created.value = next;
        },
      };
      captured.sharedValues.push(created);
      return created;
    });
    return box;
  }
  return {
    default: {
      View: vi.fn(({ children }: { children?: ReactNode }) =>
        React.createElement("div", null, children),
      ),
    },
    useSharedValue,
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withSpring: (value: number) => value,
    withTiming: (
      value: number,
      _config?: unknown,
      callback?: (finished: boolean) => void,
    ) => {
      if (callback) queueMicrotask(() => callback(true));
      return value;
    },
    interpolate: () => 0,
  };
});

vi.mock("react-native-gesture-handler", () => {
  class Pan {
    activeOffsetX() {
      return this;
    }
    failOffsetY() {
      return this;
    }
    onChange() {
      return this;
    }
    onEnd(handler: PanEnd) {
      captured.onEnd = handler;
      return this;
    }
  }
  return {
    Gesture: { Pan: vi.fn(() => new Pan()) },
    GestureDetector: vi.fn(({ children }: { children: ReactNode }) => children),
  };
});

vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    fn(...args),
}));

vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    View: vi.fn(({ children }: { children?: ReactNode }) =>
      React.createElement("div", null, children),
    ),
    Pressable: vi.fn(
      ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) =>
        React.createElement("button", { onClick: onPress }, children),
    ),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});

vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));

vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", async () => {
  const React = await import("react");
  return {
    ThemedText: vi.fn(({ children }: { children?: ReactNode }) =>
      React.createElement("span", null, children),
    ),
  };
});
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("@/lib/motion", () => ({ motion: { spring: { drag: {} } } }));

// The deck hook's module imports the Convex client; neither is exercised.
vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { plans: {}, placeVisits: {} },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));

function place(name: string): PlanPlace {
  return { name, why: `Why ${name}`, itemId: "item" as Id<"items"> };
}

/** The plan screen's wiring: the real deck state drives the deck component. */
function Deck({ places }: { places: PlanPlace[] }) {
  const deck = usePlanDeck(1, places.length);
  return (
    <PlanDeck
      places={places}
      front={deck.front}
      flipped={deck.flipped}
      imageFor={() => undefined}
      titleFor={() => undefined}
      isVisited={() => false}
      onFlip={deck.flip}
      onNext={deck.next}
      onOpenMaps={() => undefined}
    />
  );
}

/** A committed swipe to the right, then the animation's completion. */
async function swipeTopCardAway() {
  const onEnd = captured.onEnd;
  if (onEnd === null) throw new Error("pan gesture not mounted");
  await act(async () => {
    onEnd({ translationX: 200, velocityX: 1200 }, true);
    await Promise.resolve();
  });
}

/** The deck's horizontal pan offset: the first shared value PlanDeck makes. */
function panX(): number {
  return captured.sharedValues[0].get();
}

beforeEach(() => {
  captured.onEnd = null;
  captured.sharedValues = [];
});

describe("PlanDeck swipe", () => {
  it("centres the next card after a swipe", async () => {
    render(<Deck places={[place("Tigre"), place("Sweet Linda")]} />);
    expect(panX()).toBe(0);

    await swipeTopCardAway();

    expect(panX()).toBe(0);
  });

  it("brings the only card of a one-place plan back to the centre", async () => {
    render(<Deck places={[place("Tigre")]} />);
    expect(panX()).toBe(0);

    await swipeTopCardAway();

    // The deck's one card is also its next card. It must be back in view.
    expect(panX()).toBe(0);
  });
});
