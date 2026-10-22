// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripBuildStep, TripLockedStep, TripRevealStep } from "./trip-teaser";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  icon: ({ name }: { name: string }) => <i data-testid={`icon-${name}`} />,
  ring: () => <i data-testid="ring" />,
  image: () => <i data-testid="image" />,
  card: ({ locked }: { locked: boolean }) => (
    <div data-testid="card" data-locked={String(locked)} />
  ),
  button: ({
    label,
    onPress,
    busy,
  }: {
    label: string;
    onPress: () => void;
    busy?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={busy}>
      {label}
    </button>
  ),
}));

vi.mock("react-native", () => ({ View: mock.view, Text: mock.text }));
vi.mock("react-native-reanimated", () => ({ default: { View: mock.view } }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { primaryText: "#000" } } }),
}));
vi.mock("expo-image", () => ({ Image: mock.image }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: mock.icon }));
vi.mock("@/components/ui/stitch-loader", () => ({ StitchRing: mock.ring }));
vi.mock("@/components/onboarding/parts", () => ({ CtaButton: mock.button }));
vi.mock("@/components/onboarding/trip-teaser-card", () => ({
  SampleTripCard: mock.card,
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: object) =>
    values === undefined ? key : `${key}:${JSON.stringify(values)}`,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/motion", () => ({ settleIn: () => ({}) }));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number, step = 50) => {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    act(() => vi.advanceTimersByTime(Math.min(step, ms - elapsed)));
  }
};

describe("TripBuildStep", () => {
  it("shows the three sample saves and the four steps, the first under way", () => {
    render(<TripBuildStep onDone={vi.fn()} />);
    expect(screen.getAllByTestId("image")).toHaveLength(2);
    expect(screen.getByText("Old Town Square")).toBeTruthy();
    expect(screen.getByText("Three days in Prague")).toBeTruthy();
    expect(screen.getByText("Café Louvre")).toBeTruthy();
    expect(screen.getByText('tripTeaser.stepRead:{"saves":"3"}')).toBeTruthy();
    expect(screen.getByText("tripTeaser.stepFind")).toBeTruthy();
    expect(screen.getByText("tripTeaser.stepPin")).toBeTruthy();
    expect(screen.getByText("tripTeaser.stepPlan")).toBeTruthy();
    expect(screen.getAllByTestId("ring")).toHaveLength(1);
    expect(screen.queryAllByTestId("icon-checkmark")).toHaveLength(0);
  });

  it("says each sample save names its places", () => {
    render(<TripBuildStep onDone={vi.fn()} />);
    expect(
      screen.getAllByText('tripTeaser.placeCount:{"count":1}'),
    ).toHaveLength(2);
    expect(screen.getByText('tripTeaser.placeCount:{"count":3}')).toBeTruthy();
  });

  it("ticks one step off at a time", () => {
    render(<TripBuildStep onDone={vi.fn()} />);
    advance(750);
    expect(screen.getAllByTestId("icon-checkmark")).toHaveLength(1);
    advance(750);
    expect(screen.getAllByTestId("icon-checkmark")).toHaveLength(2);
    advance(1500);
    expect(screen.getAllByTestId("icon-checkmark")).toHaveLength(4);
    expect(screen.queryAllByTestId("ring")).toHaveLength(0);
  });

  it("moves on by itself once every step is ticked, and not before", () => {
    const onDone = vi.fn();
    render(<TripBuildStep onDone={onDone} />);
    advance(4 * 750);
    expect(onDone).not.toHaveBeenCalled();
    advance(499, 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(1, 1);
    expect(onDone).toHaveBeenCalledOnce();
    advance(10_000);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("calls the newest onDone when the parent re-renders mid-build", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<TripBuildStep onDone={first} />);
    advance(1000);
    rerender(<TripBuildStep onDone={second} />);
    advance(10_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("does nothing once it is gone", () => {
    const onDone = vi.fn();
    const { unmount } = render(<TripBuildStep onDone={onDone} />);
    advance(1000);
    unmount();
    advance(10_000);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("TripLockedStep", () => {
  it("shows the locked sample trip and says what the button leads to", () => {
    render(<TripLockedStep leaving={false} onUnlock={vi.fn()} />);
    expect(screen.getByTestId("card").dataset.locked).toBe("true");
    expect(screen.getByText("tripTeaser.lockedTitleAccent")).toBeTruthy();
    expect(
      screen.getByText('tripTeaser.sampleBody:{"saves":"3"}'),
    ).toBeTruthy();
    expect(screen.getByText("tripTeaser.unlockNote")).toBeTruthy();
  });

  it("opens the paywall with one tap", () => {
    const onUnlock = vi.fn();
    render(<TripLockedStep leaving={false} onUnlock={onUnlock} />);
    fireEvent.click(screen.getByText("tripTeaser.unlock"));
    expect(onUnlock).toHaveBeenCalledOnce();
  });

  it("takes no taps while the paywall is on its way", () => {
    const onUnlock = vi.fn();
    render(<TripLockedStep leaving onUnlock={onUnlock} />);
    fireEvent.click(screen.getByText("tripTeaser.unlock"));
    expect(onUnlock).not.toHaveBeenCalled();
  });
});

describe("TripRevealStep", () => {
  it("shows the open sample trip and says it is a sample", () => {
    render(<TripRevealStep onContinue={vi.fn()} />);
    expect(screen.getByTestId("card").dataset.locked).toBe("false");
    expect(screen.getByText("tripTeaser.revealTitle")).toBeTruthy();
    expect(screen.getByText("tripTeaser.revealBody")).toBeTruthy();
  });

  it("continues with one tap", () => {
    const onContinue = vi.fn();
    render(<TripRevealStep onContinue={onContinue} />);
    fireEvent.click(screen.getByText("common.continue"));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("continues once when it is tapped twice before the screen redraws", () => {
    const onContinue = vi.fn();
    render(<TripRevealStep onContinue={onContinue} />);
    const button = screen.getByText("common.continue");
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("takes no more taps once it has continued", () => {
    const onContinue = vi.fn();
    render(<TripRevealStep onContinue={onContinue} />);
    fireEvent.click(screen.getByText("common.continue"));
    fireEvent.click(screen.getByText("common.continue"));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
