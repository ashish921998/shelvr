// @vitest-environment jsdom
// The promise step: names the reminder only when one was scheduled, and its
// one button hands over to the paywall.
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { PromiseStep } from "./promise";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
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
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 1.5 }));
vi.mock("@/components/onboarding/parts", () => ({ CtaButton: mock.button }));

describe("PromiseStep", () => {
  it("names the reminder that was scheduled", () => {
    render(
      <PromiseStep reminder="weekend" leaving={false} onCommit={vi.fn()} />,
    );
    expect(screen.getByText("promise.reminderWeekend")).toBeTruthy();
    expect(screen.queryByText("promise.comeBack")).toBeNull();
    expect(screen.getByText("promise.share")).toBeTruthy();
    expect(screen.getByText("promise.use")).toBeTruthy();
  });

  it("promises to come back when no reminder was set", () => {
    render(<PromiseStep reminder={null} leaving={false} onCommit={vi.fn()} />);
    expect(screen.getByText("promise.comeBack")).toBeTruthy();
  });

  it("commits with one tap", () => {
    const onCommit = vi.fn();
    render(<PromiseStep reminder={null} leaving={false} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("promise.cta"));
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("takes no taps while the paywall is on its way", () => {
    const onCommit = vi.fn();
    render(<PromiseStep reminder={null} leaving onCommit={onCommit} />);
    fireEvent.click(screen.getByText("promise.cta"));
    expect(onCommit).not.toHaveBeenCalled();
  });
});
