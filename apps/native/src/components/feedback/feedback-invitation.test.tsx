// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { FeedbackInvitation } from "./feedback-invitation";

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: {
      opacity: { pressed: 0.7 },
      colors: { primaryText: "#935d09", muted: "#6f6455" },
    },
  }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(
    ({ children, testID }: { children: ReactNode; testID?: string }) => (
      <div data-testid={testID}>{children}</div>
    ),
  ),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
    }) => (
      <button aria-label={accessibilityLabel} onClick={onPress}>
        {children}
      </button>
    ),
  ),
}));

it("opens feedback from the row and dismisses only from the close button", () => {
  const onSendFeedback = vi.fn();
  const onDismiss = vi.fn();
  render(
    <FeedbackInvitation
      onSendFeedback={onSendFeedback}
      onDismiss={onDismiss}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", {
      name: "feedback.invitationTitle feedback.open",
    }),
  );
  expect(onSendFeedback).toHaveBeenCalledTimes(1);
  expect(onDismiss).not.toHaveBeenCalled();

  fireEvent.click(
    screen.getByRole("button", { name: "feedback.dismissInvitation" }),
  );
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(onSendFeedback).toHaveBeenCalledTimes(1);
});

it("drops the old body copy and the Not now button", () => {
  render(<FeedbackInvitation onSendFeedback={vi.fn()} onDismiss={vi.fn()} />);
  expect(screen.getByText("feedback.invitationTitle")).toBeTruthy();
  expect(screen.queryByText("feedback.invitationBody")).toBeNull();
  expect(screen.queryByText("common.notNow")).toBeNull();
});
