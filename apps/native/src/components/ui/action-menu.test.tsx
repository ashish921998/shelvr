// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { View } from "react-native";
import { expect, it, vi } from "vitest";
import { ActionMenu } from "./action-menu";

// Models React Native's responder bubbling: a touch goes to the deepest view
// whose `onStartShouldSetResponder` returns true, and ancestors never see it.
vi.mock("react-native", () => ({
  View: vi.fn(
    ({
      children,
      onStartShouldSetResponder,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onStartShouldSetResponder?: () => boolean;
      accessibilityLabel?: string;
    }) => (
      <div
        aria-label={accessibilityLabel}
        onPointerDown={(event) => {
          if (onStartShouldSetResponder?.()) event.stopPropagation();
        }}
      >
        {children}
      </div>
    ),
  ),
}));
// The native menu handles its own tap outside the JS responder system.
vi.mock("@expo/ui/community/menu", () => ({
  MenuView: vi.fn(({ children }: { children: ReactNode }) => <>{children}</>),
}));

it("keeps a tap on the trigger away from a pressable ancestor", () => {
  const cardPress = vi.fn();
  render(
    <div onPointerDown={cardPress}>
      <ActionMenu label="Item actions" title="Item actions" actions={[]}>
        <span>…</span>
      </ActionMenu>
    </div>,
  );

  fireEvent.pointerDown(screen.getByLabelText("Item actions"));

  expect(cardPress).not.toHaveBeenCalled();
});

// iOS delivers the native menu tap to JS as a second touch start, and React
// Native then asks the current responder whether a pressable ancestor may take
// the touch over.
it("refuses to hand the touch over to a pressable ancestor", () => {
  render(
    <ActionMenu label="Item actions" title="Item actions" actions={[]}>
      <span>…</span>
    </ActionMenu>,
  );

  const responder = vi
    .mocked(View)
    .mock.calls.map(([props]) => props)
    .find((props) => props.onStartShouldSetResponder?.({} as never));

  expect(responder?.onResponderTerminationRequest?.({} as never)).toBe(false);
});
