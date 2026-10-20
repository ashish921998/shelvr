// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TidyDeck } from "@/components/tidy/tidy-deck";
import {
  DeckAnimationProvider,
  useDeckAnimation,
} from "@/lib/tidy/deck-animation";

type Cell = {
  get: () => unknown;
  set: (value: unknown) => void;
};
type Observer = {
  read: () => unknown;
  react?: (value: unknown, previous: unknown) => void;
  previous: unknown;
  dependencies: Set<Cell>;
};

const runtime = vi.hoisted(() => ({
  observers: new Set<Observer>(),
  collecting: null as Set<Cell> | null,
  queued: [] as (() => void)[],
  reducedMotion: false,
  timings: [] as { value: unknown; config: unknown }[],
  gestures: [] as Record<string, (...args: unknown[]) => void>[],
}));

function evaluate(observer: Observer) {
  runtime.collecting = new Set();
  const value = observer.read();
  observer.dependencies = runtime.collecting;
  runtime.collecting = null;
  const previous = observer.previous;
  observer.previous = value;
  if (observer.react && value !== previous) observer.react(value, previous);
}

function useObserver(read: () => unknown, react?: Observer["react"]) {
  const [observer] = useState<Observer>(() => ({
    read,
    react,
    previous: undefined,
    dependencies: new Set(),
  }));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- mutable UI-thread subscription adapter, not rendered React state
    observer.read = read;
    observer.react = react;
  });
  useEffect(() => {
    runtime.observers.add(observer);
    evaluate(observer);
    return () => {
      runtime.observers.delete(observer);
    };
  }, [observer]);
  return observer;
}

vi.mock("react-native-reanimated", () => ({
  default: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- SDK export
    View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  },
  useSharedValue: (initial: unknown) => {
    const ref = useRef<Cell | null>(null);
    if (!ref.current) {
      let value = initial;
      const cell: Cell = {
        get: () => {
          runtime.collecting?.add(cell);
          return value;
        },
        set: (next) => {
          value = next;
        },
      };
      ref.current = cell;
    }
    return ref.current;
  },
  useAnimatedReaction: useObserver,
  useAnimatedStyle: (read: () => unknown) => useObserver(read),
  useDerivedValue: (read: () => unknown) => {
    const observer = useObserver(read);
    return { get: () => observer.previous ?? read() };
  },
  useReducedMotion: () => runtime.reducedMotion,
  withTiming: (value: unknown, config: unknown) => {
    runtime.timings.push({ value, config });
    return value;
  },
  withSpring: (value: unknown) => value,
  cancelAnimation: vi.fn(),
  Extrapolation: { CLAMP: "clamp" },
  interpolate: (value: number, input: number[], output: number[]) =>
    value <= input[0] ? output[0] : output.at(-1),
}));

vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => {
    runtime.queued.push(() => fn(...args));
  },
}));
vi.mock("react-native", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- SDK export
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- SDK export
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  useWindowDimensions: () => ({ width: 400, height: 800 }),
}));
vi.mock("expo-image", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- SDK export
  Image: ({ source }: { source: { uri: string } }) => (
    <img alt="" data-photo={source.uri} />
  ),
}));
vi.mock("@shopify/react-native-skia", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- SDK export
  Canvas: ({ children }: { children?: ReactNode }) => (
    <div data-canvas="true">{children}</div>
  ),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- SDK export
  Path: () => null,
  Skia: {
    PathBuilder: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- SDK method
      Make: () => ({ addArc: vi.fn(), detach: () => ({}) }),
    },
  },
}));
vi.mock("react-native-gesture-handler", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- SDK export
  GestureDetector: ({ children }: { children?: ReactNode }) => (
    <section data-card-shell="true">{children}</section>
  ),
  Gesture: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- SDK export
    Pan: () => {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      runtime.gestures.push(handlers);
      const chain: Record<string, unknown> = {};
      for (const name of ["onBegin", "onChange", "onEnd", "onFinalize"]) {
        chain[name] = (fn: (...args: unknown[]) => void) => {
          handlers[name] = fn;
          return chain;
        };
      }
      return chain;
    },
  },
}));
vi.mock("@/lib/tidy/use-single-haptic-on-pan", () => ({
  useSingleHapticOnPan: () => ({
    singleHapticOnChange: vi.fn(),
    resetHaptic: vi.fn(),
    commitHaptic: vi.fn(),
  }),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/components/symbol", () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- component export
  AppSymbolIcon: () => null,
}));
vi.mock("@/lib/motion", () => ({
  motion: {
    spring: { drag: {}, settle: {} },
    timing: { fade: { duration: 120 }, enter: { duration: 240 } },
  },
}));
vi.mock("react-native-unistyles", () => {
  const theme = {
    gap: (n: number) => n * 8,
    radius: { md: 12, xl: 24 },
    fonts: { medium: "medium", regular: "regular", bold: "bold" },
    colors: {
      keep: "green",
      danger: "red",
      primary: "blue",
      onKeep: "white",
      overlay: "black",
      imageBorder: "gray",
      surface: "white",
    },
  };
  return {
    StyleSheet: {
      create: (styles: unknown) =>
        typeof styles === "function" ? styles(theme) : styles,
      absoluteFillObject: {},
      hairlineWidth: 1,
    },
    useUnistyles: () => ({ theme }),
  };
});

let deck: ReturnType<typeof useDeckAnimation>;
function Probe() {
  const value = useDeckAnimation();
  useEffect(() => {
    deck = value;
  }, [value]);
  return null;
}

function uiFrame() {
  // Snapshot the subscriptions: worklets can enqueue RN updates but cannot
  // synchronously mount React children during this UI-thread frame.
  for (const observer of [...runtime.observers]) evaluate(observer);
}

function flushRN() {
  act(() => {
    const pending = runtime.queued.splice(0);
    for (const run of pending) run();
  });
}

function setup() {
  const photos = Array.from({ length: 24 }, (_, index) => ({
    id: `photo-${index}`,
    creationTime: 1_700_000_000_000,
    width: 400,
    height: 800,
  }));
  const view = render(
    <DeckAnimationProvider lastIndex={23}>
      <Probe />
      <TidyDeck photos={photos} onDecision={vi.fn()} />
    </DeckAnimationProvider>,
  );
  flushRN();
  const shells = () => [
    ...view.container.querySelectorAll("[data-card-shell]"),
  ];
  const indices = () =>
    shells().flatMap((shell, index) =>
      shell.querySelector("[data-canvas]") ? [index] : [],
    );
  const opacitySubscriptions = () =>
    [...runtime.observers].filter(
      (observer) =>
        observer.dependencies.has(deck.isDragging as unknown as Cell) &&
        !observer.react,
    ).length;
  return { ...view, shells, indices, opacitySubscriptions };
}

beforeEach(() => {
  runtime.observers.clear();
  runtime.queued = [];
  runtime.timings = [];
  runtime.gestures = [];
});
afterEach(cleanup);

describe.each([false, true])(
  "tidy hint window (reduced motion: %s)",
  (reduced) => {
    beforeEach(() => {
      runtime.reducedMotion = reduced;
    });

    it("mounts only four initial overlays and twelve real Skia canvases", () => {
      const view = setup();
      expect(view.shells()).toHaveLength(24);
      expect(runtime.gestures).toHaveLength(24);
      expect(view.indices()).toEqual([20, 21, 22, 23]);
      expect(view.container.querySelectorAll("[data-canvas]")).toHaveLength(12);
      expect(view.opacitySubscriptions()).toBe(4);
    });

    it("keeps shells/providers and photo identity while queued handoffs move the window", () => {
      const view = setup();
      const shells = view.shells();
      const photo = view.container.querySelector('[data-photo="photo-21"]');
      act(() => {
        deck.currentIndex.set(22);
        uiFrame();
      });
      // Before RN catches up the old overlays must still be mounted.
      expect(view.indices()).toEqual([20, 21, 22, 23]);
      expect(runtime.queued.length).toBeGreaterThan(0);
      flushRN();
      expect(view.indices()).toEqual([19, 20, 21, 22, 23]);
      expect(view.container.querySelector('[data-photo="photo-21"]')).toBe(
        photo,
      );
      act(() => {
        deck.currentIndex.set(10);
        uiFrame();
      });
      expect(view.indices()).toHaveLength(5);
      flushRN();
      expect(view.indices()).toEqual([7, 8, 9, 10, 11]);
      expect(view.container.querySelectorAll("[data-canvas]")).toHaveLength(15);
      expect(view.opacitySubscriptions()).toBe(5);
      expect(view.shells()).toEqual(shells);
      expect(runtime.gestures).toHaveLength(24);
      for (const top of [2, 0, -1]) {
        act(() => {
          deck.currentIndex.set(top);
          uiFrame();
        });
        flushRN();
        expect(view.indices()).toEqual(
          Array.from({ length: 24 }, (_, index) => index).filter(
            (index) => index >= top - 3 && index <= top + 1,
          ),
        );
        expect(view.opacitySubscriptions()).toBe(view.indices().length);
      }
    });

    it("repeated real undo reactions restore off-window hints and their fade subscriptions", () => {
      const view = setup();
      act(() => {
        deck.currentIndex.set(-1);
        uiFrame();
      });
      flushRN();
      expect(view.indices()).toEqual([0]);
      for (let index = 0; index <= 23; index++) {
        act(() => {
          deck.undoIndex.set(index);
          uiFrame();
          // A second UI frame propagates the currentIndex written by Undo to
          // every card, including cards evaluated earlier in the first frame.
          uiFrame();
        });
        expect(deck.currentIndex.get()).toBe(index);
        expect(deck.undoIndex.get()).toBeNull();
        flushRN();
        expect(view.indices()).toEqual(
          Array.from({ length: 24 }, (_, card) => card).filter(
            (card) => card >= index - 3 && card <= index + 1,
          ),
        );
        expect(view.opacitySubscriptions()).toBe(view.indices().length);
      }
      runtime.timings = [];
      act(() => {
        deck.isDragging.set(true);
        uiFrame();
      });
      expect(
        runtime.timings.filter(
          ({ value, config }) =>
            value === 1 && (config as { duration: number }).duration === 120,
        ),
      ).toHaveLength(4);
      runtime.timings = [];
      act(() => {
        deck.isDragging.set(false);
        uiFrame();
      });
      expect(
        runtime.timings.some(
          ({ value, config }) =>
            value === 0 && (config as { duration: number }).duration === 120,
        ),
      ).toBe(true);
      view.unmount();
      expect(runtime.observers.size).toBe(0);
    });
  },
);
