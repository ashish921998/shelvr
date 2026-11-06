// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NameSheet } from "./name-sheet";

type ModalProps = {
  visible: boolean;
  children: ReactNode;
  onDismiss?: () => void;
};

const mocks = vi.hoisted(() => ({
  modal: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/components/onboarding/parts", () => ({
  GhostButton: vi.fn(
    ({ label, onPress }: { label: string; onPress: () => void }) => (
      <button type="button" onClick={onPress}>
        {label}
      </button>
    ),
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: vi.fn(
    ({
      title,
      onPress,
      disabled,
    }: {
      title: string;
      onPress: () => void;
      disabled?: boolean;
    }) => (
      <button type="button" disabled={disabled} onClick={onPress}>
        {title}
      </button>
    ),
  ),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { users: { setMyName: "setMyName" } },
}));
vi.mock("convex/react", () => ({ useMutation: () => mocks.save }));
vi.mock("react-native-reanimated", () => ({ useReducedMotion: () => false }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { muted: "muted" } } }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  KeyboardAvoidingView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Modal: vi.fn((props: ModalProps) => {
    mocks.modal(props);
    return props.visible ? <div>{props.children}</div> : null;
  }),
  Platform: { OS: "ios" },
  Pressable: vi.fn(
    ({
      onPress,
      accessibilityLabel,
    }: {
      onPress: () => void;
      accessibilityLabel: string;
    }) => (
      <button type="button" aria-label={accessibilityLabel} onClick={onPress} />
    ),
  ),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  TextInput: vi.fn(() => null),
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
}));

function lastModal(): ModalProps {
  return mocks.modal.mock.lastCall?.[0] as ModalProps;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NameSheet", () => {
  it("answers at once and tells the caller separately when the sheet has finished hiding", () => {
    const onDone = vi.fn();
    const onCancel = vi.fn();
    const onDismiss = vi.fn();
    const sheet = (visible: boolean) => (
      <NameSheet
        visible={visible}
        kind="create"
        onDone={onDone}
        onCancel={onCancel}
        onDismiss={onDismiss}
      />
    );
    const { rerender } = render(sheet(true));
    fireEvent.click(
      screen.getByRole("button", { name: "sharedLists.nameSkip" }),
    );
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    rerender(sheet(false));
    expect(lastModal().visible).toBe(false);
    expect(onDismiss).not.toHaveBeenCalled();
    lastModal().onDismiss?.();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels rather than answers when an invite's sheet is closed", () => {
    const onDone = vi.fn();
    const onCancel = vi.fn();
    render(
      <NameSheet
        visible
        kind="create"
        onDone={onDone}
        onCancel={onCancel}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "common.notNow" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});
