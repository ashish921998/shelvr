// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { View } from "react-native";
import { beforeEach, expect, it, vi } from "vitest";
import { ActionMenu, dropMenuDismissTouch } from "./action-menu";

type TouchAt = { nativeEvent: { pageX: number; pageY: number } };
const touchAt = (event: { clientX: number; clientY: number }): TouchAt => ({
  nativeEvent: { pageX: event.clientX, pageY: event.clientY },
});

vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn() },
  Platform: { OS: "ios" },
  View: vi.fn(
    ({
      children,
      onStartShouldSetResponder,
      onResponderGrant,
      onResponderRelease,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onStartShouldSetResponder?: () => boolean;
      onResponderGrant?: (event: TouchAt) => void;
      onResponderRelease?: (event: TouchAt) => void;
      accessibilityLabel?: string;
    }) => (
      <div
        aria-label={accessibilityLabel}
        onMouseDown={(event) => {
          if (!onStartShouldSetResponder?.()) return;
          event.stopPropagation();
          onResponderGrant?.(touchAt(event));
        }}
        onMouseUp={(event) => {
          if (!onStartShouldSetResponder?.()) return;
          event.stopPropagation();
          onResponderRelease?.(touchAt(event));
        }}
      >
        {children}
      </div>
    ),
  ),
}));
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

function renderCard(cardPress: () => void, onShare = () => {}) {
  return render(
    <div
      onMouseDownCapture={(event) => {
        if (dropMenuDismissTouch()) event.stopPropagation();
      }}
    >
      <div data-testid="card" onMouseDown={cardPress}>
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
  fireEvent.mouseDown(element);
  fireEvent.mouseUp(element);
}

it("is one labelled element for VoiceOver, around the menu's own button", () => {
  renderCard(vi.fn());

  const labelled = vi
    .mocked(View)
    .mock.calls.map(([props]) => props)
    .filter((props) => props.accessibilityLabel === "Item actions");

  expect(labelled.length).toBeGreaterThan(0);
  expect(labelled.every((props) => props.accessible === true)).toBe(true);
  expect(labelled.every((props) => props.onStartShouldSetResponder)).toBe(true);
});

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

it("lets the next tap through when an open menu unmounts", () => {
  const cardPress = vi.fn();
  const { unmount } = renderCard(vi.fn());

  tap(screen.getByLabelText("Item actions"));
  unmount();
  renderCard(cardPress);
  tap(screen.getByTestId("card"));

  expect(cardPress).toHaveBeenCalledTimes(1);
});

it("lets the next tap through when the finger slides off the trigger", () => {
  const cardPress = vi.fn();
  renderCard(cardPress);

  const trigger = screen.getByLabelText("Item actions");
  fireEvent.mouseDown(trigger, { clientX: 300, clientY: 500 });
  fireEvent.mouseUp(trigger, { clientX: 220, clientY: 500 });
  tap(screen.getByTestId("card"));

  expect(cardPress).toHaveBeenCalledTimes(1);
});
