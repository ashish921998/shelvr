// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PromptSheet } from "./prompt-sheet";

const mock = vi.hoisted(() => ({
  reducedMotion: false,
  modal: vi.fn(),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("react-native-reanimated", () => ({
  useReducedMotion: () => mock.reducedMotion,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  Modal: vi.fn(
    (props: {
      visible: boolean;
      children: ReactNode;
      onRequestClose: () => void;
    }) => {
      mock.modal(props);
      return props.visible ? <div>{props.children}</div> : null;
    },
  ),
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      onPress,
      accessibilityLabel,
    }: {
      onPress: () => void;
      accessibilityLabel: string;
    }) => <button aria-label={accessibilityLabel} onClick={onPress} />,
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each([false, true])("PromptSheet reduced motion %s", (reduced) => {
  it("preserves native presentation, content, actions and hidden state", () => {
    mock.reducedMotion = reduced;
    const onClose = vi.fn();
    const action = vi.fn();
    const sheet = (visible: boolean) => (
      <PromptSheet
        visible={visible}
        onClose={onClose}
        title="Prompt title"
        body="Prompt body"
        actions={<button onClick={action}>Accept</button>}
      >
        <span>Optional content</span>
      </PromptSheet>
    );
    const { rerender } = render(sheet(true));
    expect(mock.modal.mock.lastCall?.[0]).toMatchObject({
      visible: true,
      transparent: true,
      animationType: reduced ? "fade" : "slide",
      onRequestClose: onClose,
    });
    expect(screen.getByText("Prompt title")).toBeTruthy();
    expect(screen.getByText("Prompt body")).toBeTruthy();
    expect(screen.getByText("Optional content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    rerender(sheet(false));
    expect(mock.modal.mock.lastCall?.[0]).toMatchObject({ visible: false });
    expect(screen.queryByText("Prompt title")).toBeNull();
  });

  it("closes through the scrim and native request without making content dismiss", () => {
    mock.reducedMotion = reduced;
    const onClose = vi.fn();
    render(
      <PromptSheet
        visible
        onClose={onClose}
        title="Prompt title"
        body="Prompt body"
        actions={null}
      />,
    );
    fireEvent.click(screen.getByText("Prompt body"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "common.notNow" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    mock.modal.mock.lastCall?.[0].onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
