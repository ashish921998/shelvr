// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RateStep } from "./rate";

type Children = { children?: ReactNode };

const mocks = vi.hoisted(() => ({
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  pill: ({
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
  ghost: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onPress} disabled={disabled}>
      {label}
    </button>
  ),
  capture: vi.fn(),
  requestReviewOnce: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
}));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mocks.capture } }));
vi.mock("@/lib/review-prompt", () => ({
  requestReviewOnce: mocks.requestReviewOnce,
}));
vi.mock("react-native", () => ({ View: mocks.view, Text: mocks.text }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("@/components/onboarding/parts", () => ({
  PillButton: mocks.pill,
  GhostButton: mocks.ghost,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestReviewOnce.mockResolvedValue(undefined);
});
afterEach(cleanup);

it("asks for the review and moves on at once on Love it", () => {
  const onContinue = vi.fn();
  mocks.requestReviewOnce.mockReturnValue(new Promise(() => undefined));
  render(<RateStep leaving={false} onContinue={onContinue} />);
  fireEvent.click(screen.getByRole("button", { name: "onboardingRate.love" }));
  expect(mocks.requestReviewOnce).toHaveBeenCalledTimes(1);
  expect(onContinue).toHaveBeenCalledTimes(1);
  expect(mocks.capture).toHaveBeenCalledWith("onboarding_rate", {
    action: "love",
  });
});

it("moves on without asking on Not right now", () => {
  const onContinue = vi.fn();
  render(<RateStep leaving={false} onContinue={onContinue} />);
  fireEvent.click(screen.getByRole("button", { name: "onboardingRate.later" }));
  expect(mocks.requestReviewOnce).not.toHaveBeenCalled();
  expect(onContinue).toHaveBeenCalledTimes(1);
  expect(mocks.capture).toHaveBeenCalledWith("onboarding_rate", {
    action: "later",
  });
});

it("holds both answers while the paywall is opening", () => {
  render(<RateStep leaving onContinue={vi.fn()} />);
  for (const name of ["onboardingRate.love", "onboardingRate.later"])
    expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(
      true,
    );
});
