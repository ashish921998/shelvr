// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";
import { fadeIn } from "@/lib/motion";

const mocks = vi.hoisted(() => ({
  entering: vi.fn(),
  reducedMotion: false,
}));
vi.mock("react-native", () => ({
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native-reanimated", () => {
  function builder(config: Record<string, unknown> = {}) {
    return {
      config,
      duration: (duration: number) => builder({ ...config, duration }),
      easing: (easing: unknown) => builder({ ...config, easing }),
      reduceMotion: (reduceMotion: unknown) =>
        builder({ ...config, reduceMotion }),
      delay: (delay: number) => builder({ ...config, delay }),
    };
  }
  return {
    default: {
      View: vi.fn(
        ({
          entering,
          children,
        }: {
          entering?: unknown;
          children: ReactNode;
        }) => {
          mocks.entering(entering);
          return <div>{children}</div>;
        },
      ),
    },
    FadeIn: builder(),
    FadeOut: builder(),
    Easing: { bezier: vi.fn() },
    cubicBezier: vi.fn(),
    ReduceMotion: { Never: "never", System: "system" },
    useReducedMotion: () => mocks.reducedMotion,
  };
});

beforeEach(() => mocks.entering.mockClear());

describe.each([false, true])("Reduce Motion enabled: %s", (reducedMotion) => {
  beforeEach(() => {
    mocks.reducedMotion = reducedMotion;
  });

  it("uses the shared entrance by default and preserves copy", () => {
    render(<EmptyState title="Nothing yet" message="Save something" />);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.getByText("Save something")).toBeTruthy();
    expect(mocks.entering).toHaveBeenLastCalledWith(fadeIn);
    expect(fadeIn).toMatchObject({
      config: { duration: 250, reduceMotion: "never" },
    });
  });

  it("omits the entrance when explicitly opted out", () => {
    render(
      <EmptyState
        title="Nothing yet"
        message="Save something"
        animateEntrance={false}
      />,
    );
    expect(mocks.entering).toHaveBeenLastCalledWith(undefined);
  });
});
