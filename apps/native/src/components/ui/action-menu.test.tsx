// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { View } from "react-native";
import { beforeEach, expect, it, vi } from "vitest";
import { ActionMenu, dropMenuDismissTouch } from "./action-menu";

// Models React Native's responder bubbling: a touch goes to the deepest view
// whose `onStartShouldSetResponder` returns true, and ancestors never see it.
// That view also receives the release.
vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn() },
  Platform: { OS: "ios" },
  View: vi.fn(
    ({
      children,
      onStartShouldSetResponder,
      onResponderRelease,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onStartShouldSetResponder?: () => boolean;
      onResponderRelease?: () => void;
      accessibilityLabel?: string;
    }) => (
      <div
        aria-label={accessibilityLabel}
        onPointerDown={(event) => {
          if (onStartShouldSetResponder?.()) event.stopPropagation();
        }}
        onPointerUp={(event) => {
          if (!onStartShouldSetResponder?.()) return;
          event.stopPropagation();
          onResponderRelease?.();
        }}
      >
        {children}
      </div>
    ),
  ),
}));
// The native menu handles its own taps outside the JS responder system; the
// "Pick" button stands in for choosing an item from the open menu.
vi.mock("@expo/ui/community/menu", () => ({
  MenuView: vi.fn(
    ({
      children,
      onPressAction,
    }: {
      children: ReactNode;
      onPressAction: (event: { nativeEvent: { event: string } }) => void;
    }) => (
      <>
        {children}
        <button
          type="button"
          onClick={() => onPressAction({ nativeEvent: { event: "share" } })}
        >
          Pick
        </button>
      </>
    ),
  ),
}));

beforeEach(() => {
  dropMenuDismissTouch();
});

// The app root drops a touch in the capture phase, before any child sees it.
function renderCard(cardPress: () => void, onShare = () => {}) {
  render(
    <div
      onPointerDownCapture={(event) => {
        if (dropMenuDismissTouch()) event.stopPropagation();
      }}
    >
      <div data-testid="card" onPointerDown={cardPress}>
        <ActionMenu
          label="Item actions"
          title="Item actions"
          actions={[{ id: "share", label: "Share", onPress: onShare }]}
        >
          <span>…</span>
        </ActionMenu>
      </div>
    </div>,
  );
}

function tap(element: HTMLElement) {
  fireEvent.pointerDown(element);
  fireEvent.pointerUp(element);
}

it("keeps a tap on the trigger away from a pressable ancestor", () => {
  const cardPress = vi.fn();
  renderCard(cardPress);

  tap(screen.getByLabelText("Item actions"));

  expect(cardPress).not.toHaveBeenCalled();
});

// iOS delivers the native menu tap to JS as a second touch start, and React
// Native then asks the current responder whether a pressable ancestor may take
// the touch over.
it("refuses to hand the touch over to a pressable ancestor", () => {
  renderCard(vi.fn());

  const responder = vi
    .mocked(View)
    .mock.calls.map(([props]) => props)
    .find((props) => props.onStartShouldSetResponder?.({} as never));

  expect(responder?.onResponderTerminationRequest?.({} as never)).toBe(false);
});

it("drops the tap that dismisses an open menu, and only that tap", () => {
  const cardPress = vi.fn();
  renderCard(cardPress);

  tap(screen.getByLabelText("Item actions"));
  tap(screen.getByTestId("card"));
  expect(cardPress).not.toHaveBeenCalled();

  tap(screen.getByTestId("card"));
  expect(cardPress).toHaveBeenCalledTimes(1);
});

it("lets the next tap through after an item is picked", () => {
  const cardPress = vi.fn();
  const onShare = vi.fn();
  renderCard(cardPress, onShare);

  tap(screen.getByLabelText("Item actions"));
  fireEvent.click(screen.getByText("Pick"));
  tap(screen.getByTestId("card"));

  expect(onShare).toHaveBeenCalledTimes(1);
  expect(cardPress).toHaveBeenCalledTimes(1);
});
