// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Crossfade } from "./crossfade";

const preferences = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/lib/motion", () => ({
  motion: { duration: { feedback: 120 }, easing: { out: "out" } },
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  StyleSheet: { absoluteFill: {} },
}));
vi.mock("react-native-reanimated", () => {
  const animation = {
    duration: (ms: number) => ({
      easing: () => ({ reduceMotion: () => ms }),
    }),
  };
  return {
    FadeIn: animation,
    FadeOut: animation,
    ReduceMotion: { Never: "never" },
    useReducedMotion: () => preferences.reduced,
    default: {
      View: vi.fn(
        ({
          children,
          pointerEvents,
          accessibilityElementsHidden,
          entering,
        }: {
          children: ReactNode;
          pointerEvents?: string;
          accessibilityElementsHidden?: boolean;
          entering?: number;
        }) => (
          <div
            aria-hidden={accessibilityElementsHidden}
            data-pointer-events={pointerEvents}
            data-duration={entering}
          >
            {children}
          </div>
        ),
      ),
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
  preferences.reduced = false;
});

it("hides the outgoing controls from accessibility and touch while the new controls are available", () => {
  vi.useFakeTimers();
  const { rerender } = render(
    <Crossfade identity="old">
      <button>Old</button>
    </Crossfade>,
  );
  rerender(
    <Crossfade identity="new">
      <button>New</button>
    </Crossfade>,
  );
  expect(screen.queryByRole("button", { name: "Old" })).toBeNull();
  expect(screen.getByText("Old").parentElement?.dataset.pointerEvents).toBe(
    "none",
  );
  expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
  act(() => vi.advanceTimersByTime(120));
  expect(screen.queryByText("Old")).toBeNull();
});

it("keeps only the latest outgoing state when changes arrive before the fade completes", () => {
  vi.useFakeTimers();
  const { rerender } = render(<Crossfade identity="a">A</Crossfade>);
  rerender(<Crossfade identity="b">B</Crossfade>);
  act(() => vi.advanceTimersByTime(60));
  rerender(<Crossfade identity="c">C</Crossfade>);
  expect(screen.queryByText("A")).toBeNull();
  act(() => vi.advanceTimersByTime(60));
  expect(screen.getByText("B")).toBeTruthy();
  act(() => vi.advanceTimersByTime(60));
  expect(screen.queryByText("B")).toBeNull();
  expect(screen.getByText("C")).toBeTruthy();
});

it("preserves form state across unrelated parent renders", () => {
  function Field() {
    const [text, setText] = useState("");
    return (
      <input
        aria-label="Message"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    );
  }
  const { rerender } = render(
    <Crossfade identity="form">
      <Field />
    </Crossfade>,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Draft" } });
  rerender(
    <Crossfade identity="form">
      <Field />
    </Crossfade>,
  );
  expect(screen.getByRole("textbox").getAttribute("value")).toBe("Draft");
});

it("uses a short fade with reduced motion and cleans up on unmount", () => {
  vi.useFakeTimers();
  preferences.reduced = true;
  const { rerender, unmount } = render(
    <Crossfade identity="a" duration={180}>
      A
    </Crossfade>,
  );
  rerender(
    <Crossfade identity="b" duration={180}>
      B
    </Crossfade>,
  );
  expect(screen.getByText("B").dataset.duration).toBe("120");
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
